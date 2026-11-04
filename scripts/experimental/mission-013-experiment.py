import json, os, hashlib, numpy as np, torch
from torchvision.models import (mobilenet_v3_small, MobileNet_V3_Small_Weights,
  efficientnet_b0, EfficientNet_B0_Weights)
from torchvision import transforms
from PIL import Image, ImageOps
from ultralytics import YOLO
ROOT='/home/rtl/Documentos/GitHub/boiscan-benchmark-013'
rows=json.load(open(f'{ROOT}/data/dataset.json'))
det=YOLO('/home/rtl/Documentos/GitHub/boiscan-benchmark-012/yolo11n-seg.pt')

def crop_cow(img):
    r=det(img, conf=0.25, verbose=False)[0]
    boxes=r.boxes
    if boxes is None or len(boxes)==0:
        return None
    # largest box
    xyxy=boxes.xyxy.cpu().numpy()
    areas=(xyxy[:,2]-xyxy[:,0])*(xyxy[:,3]-xyxy[:,1])
    i=int(np.argmax(areas))
    x1,y1,x2,y2=xyxy[i]
    w=x2-x1; h=y2-y1
    # margin 10%
    mx=0.1*w; my=0.1*h
    x1=max(0,x1-mx); y1=max(0,y1-my); x2=min(img.width,x2+mx); y2=min(img.height,y2+my)
    # preserve aspect by padding to square? keep crop rect
    return img.crop((x1,y1,x2,y2))

tf_mob=transforms.Compose([transforms.Resize((224,224)),transforms.ToTensor(),transforms.Normalize(mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225])])
tf_eff=transforms.Compose([transforms.Resize((224,224)),transforms.ToTensor(),transforms.Normalize(mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225])])

mob=mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT).features.eval()
mob=torch.nn.Sequential(mob, torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten())
eff=efficientnet_b0(weights=EfficientNet_B0_Weights.DEFAULT).features.eval()
eff=torch.nn.Sequential(eff, torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten())

def embed(img, model, tf):
    x=tf(img).unsqueeze(0)
    with torch.no_grad():
        return model(x).numpy().ravel().astype(np.float64)

# build features
names=['mob_orig','mob_crop','eff_orig','eff_crop']
feats={n:np.zeros((len(rows), 576 if 'mob' in n else 1280),dtype=np.float64) for n in names}
crop_ok=[]
for i,r in enumerate(rows):
    img=ImageOps.exif_transpose(Image.open(r['image'])).convert('RGB')
    cr=crop_cow(img)
    crop_ok.append(cr is not None)
    if cr is None: cr=img
    feats['mob_orig'][i]=embed(img,mob,tf_mob)
    feats['mob_crop'][i]=embed(cr,mob,tf_mob)
    feats['eff_orig'][i]=embed(img,eff,tf_eff)
    feats['eff_crop'][i]=embed(cr,eff,tf_eff)
print('crop_ok',sum(crop_ok),len(rows))
np.save(f'{ROOT}/data/crop_ok.npy',np.array(crop_ok))

dev_idx=[i for i,r in enumerate(rows) if r['split'] in ('train','val')]
test_idx=[i for i,r in enumerate(rows) if r['split']=='test']
y=np.array([r['weight_kg'] for r in rows],float)
src=np.array([r['source'] for r in rows])

def fold(aid): return int(hashlib.sha256(aid.encode()).hexdigest(),16)%5

def cv_eval(X, ydev, ids_dev):
    # 5-fold by animal
    folds=np.array([fold(aid) for aid in ids_dev])
    tr_pos=np.arange(len(ids_dev))
    preds=np.zeros(len(ids_dev))
    for f in range(5):
        va=folds==f; trn=~va
        Xtr=X[trn]; ytr=ydev[trn]
        # standardize
        mu=Xtr.mean(0); sd=Xtr.std(0); sd[sd<1e-6]=1
        Ztr=(Xtr-mu)/sd; Zva=(X[va]-mu)/sd
        ym=ytr.mean()
        # ridge alpha search
        best=None
        for a in [0.1,1,3,10,30,100,300,1000,3000,10000]:
            # inner? just use same fold CV no; use closed form
            w=np.linalg.solve(Ztr.T@Ztr+a*np.eye(Ztr.shape[1]),Ztr.T@(ytr-ym))
            p=Zva@w+ym
            # store? we need choose alpha globally; do outer alpha via nested? simplify: evaluate all alpha on this fold and average later
            pass
        # choose alpha by mini CV within train? skip; use fixed 300 for comparability? We'll search alpha globally via 5-fold on dev for each candidate separately outside.
        preds[va]=Zva@np.linalg.solve(Ztr.T@Ztr+300*np.eye(Ztr.shape[1]),Ztr.T@(ytr-ym))+ym
    return preds

# Global alpha search per feature via 5-fold
def search_alpha(Xdev, ydev, ids_dev):
    folds=np.array([fold(a) for a in ids_dev])
    best=None
    for a in [0.1,1,3,10,30,100,300,1000,3000,10000]:
        preds=np.zeros(len(ids_dev))
        for f in range(5):
            va=folds==f; trn=~va
            Xtr=Xdev[trn]; ytr=ydev[trn]
            mu=Xtr.mean(0); sd=Xtr.std(0); sd[sd<1e-6]=1
            Ztr=(Xtr-mu)/sd; Zva=(Xdev[va]-mu)/sd
            ym=ytr.mean()
            w=np.linalg.solve(Ztr.T@Ztr+a*np.eye(Ztr.shape[1]),Ztr.T@(ytr-ym))
            preds[va]=Zva@w+ym
        mae=float(np.mean(np.abs(preds-ydev)))
        if best is None or mae<best[0]: best=(mae,a)
    return best

ids_dev=[rows[i]['animal_id'] for i in dev_idx]
ydev=y[dev_idx]

results={}
for name in names:
    Xdev=feats[name][dev_idx]
    mae,a=search_alpha(Xdev,ydev,ids_dev)
    # final CV preds with best alpha
    folds=np.array([fold(x) for x in ids_dev])
    preds=np.zeros(len(ids_dev))
    for f in range(5):
        va=folds==f; trn=~va
        Xtr=Xdev[trn]; ytr=ydev[trn]
        mu=Xtr.mean(0); sd=Xtr.std(0); sd[sd<1e-6]=1
        Ztr=(Xtr-mu)/sd; Zva=(Xdev[va]-mu)/sd
        ym=ytr.mean()
        w=np.linalg.solve(Ztr.T@Ztr+a*np.eye(Ztr.shape[1]),Ztr.T@(ytr-ym))
        preds[va]=Zva@w+ym
    err=preds-ydev
    results[name]={'cv_mae':mae,'alpha':a,
        'cv_rmse':float(np.sqrt(np.mean(err**2))),
        'cv_bias':float(np.mean(err)),
        'cv_mape':float(np.mean(np.abs(err/ydev))*100)}
    print(name, results[name])

# constant baseline on dev
const_mae=float(np.mean(np.abs(ydev-ydev.mean())))
print('const_dev_mae',const_mae)

# test evaluation for best candidate by cv_mae
best=min(results,key=lambda k:results[k]['cv_mae'])
print('best',best)
# train on all dev, predict test
Xdev=feats[best][dev_idx]; Xtest=feats[best][test_idx]
mu=Xdev.mean(0); sd=Xdev.std(0); sd[sd<1e-6]=1
Zdev=(Xdev-mu)/sd; Ztest=(Xtest-mu)/sd
ym=ydev.mean(); a=results[best]['alpha']
w=np.linalg.solve(Zdev.T@Zdev+a*np.eye(Zdev.shape[1]),Zdev.T@(ydev-ym))
pred_test=Ztest@w+ym
yte=y[test_idx]
print('test MAE',float(np.mean(np.abs(pred_test-yte))),'const',float(np.mean(np.abs(yte-ydev.mean()))),'bias',float(np.mean(pred_test-yte)))
# by source
for s in ['A','B']:
    m=src[test_idx]==s
    print(s,'n',m.sum(),'MAE',float(np.mean(np.abs(pred_test[m]-yte[m]))),'const',float(np.mean(np.abs(yte[m]-ydev.mean()))))

json.dump({'results':results,'best':best,'crop_ok':int(sum(crop_ok)),'n_dev':len(dev_idx),'n_test':len(test_idx)}, open(f'{ROOT}/metrics/experiment.json','w'),indent=2)
np.save(f'{ROOT}/models/{best}_coef.npy',w)
np.save(f'{ROOT}/models/{best}_mu.npy',mu)
np.save(f'{ROOT}/models/{best}_sd.npy',sd)
json.dump({'alpha':a,'mu':mu.tolist(),'sd':sd.tolist(),'coef':w.tolist(),'intercept':float(ym),'best':best}, open(f'{ROOT}/models/candidate.json','w'))
print('done')
