import json, os, numpy as np, torch
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
from torchvision import transforms
from PIL import Image, ImageOps
from torch.utils.data import Dataset, DataLoader
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows=json.load(open(os.path.join(ROOT,'data','dataset.json')))
weights=MobileNet_V3_Small_Weights.DEFAULT
tf=transforms.Compose([transforms.Resize((224,224)),transforms.ToTensor(),transforms.Normalize(mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225])])
class DS(Dataset):
 def __init__(self,rows): self.rows=rows
 def __len__(self): return len(self.rows)
 def __getitem__(self,i):
  r=self.rows[i]; im=ImageOps.exif_transpose(Image.open(r['image'])).convert('RGB')
  return tf(im),i
model=mobilenet_v3_small(weights=weights).features.eval()
model = torch.nn.Sequential(model, torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten())
feats=np.zeros((len(rows),576),dtype=np.float32)
dl=DataLoader(DS(rows),batch_size=8,num_workers=0)
with torch.no_grad():
 for x,idx in dl:
  f=model(x); feats[idx.numpy()]=f.numpy()
np.save(os.path.join(ROOT,'data','mobilenet_v3_small_features.npy'),feats)
print('features',feats.shape)
# ridge same split
train=[r for r in rows if r['split'] in ('train','val')]; test=[r for r in rows if r['split']=='test']
idx={r['animal_id']:i for i,r in enumerate(rows)}
tr=np.array([idx[r['animal_id']] for r in train]); te=np.array([idx[r['animal_id']] for r in test])
Xtr=feats[tr].astype(np.float64); Xte=feats[te].astype(np.float64); ytr=np.array([r['weight_kg'] for r in train],float); yte=np.array([r['weight_kg'] for r in test],float)
mu=Xtr.mean(0); sd=Xtr.std(0); sd[sd<1e-6]=1; Ztr=(Xtr-mu)/sd; Zte=(Xte-mu)/sd; ym=ytr.mean()
def fold(aid,k=5): return int(__import__('hashlib').sha256(aid.encode()).hexdigest(),16)%k
folds=np.array([fold(r['animal_id']) for r in train]); alphas=[0.1,1,3,10,30,100,300,1000,3000,10000]
cv=[]
for a in alphas:
 preds=np.zeros(len(tr))
 for f in range(5):
  va=folds==f; trn=~va; Xa=Ztr[trn]; ya=ytr[trn]; ymn=ya.mean()
  w=np.linalg.solve(Xa.T@Xa+a*np.eye(Xa.shape[1]),Xa.T@(ya-ymn)); preds[va]=Ztr[va]@w+ymn
 mae=float(np.mean(np.abs(preds-ytr))); cv.append((mae,a)); print(a,round(mae,3))
mae,a=min(cv); print('best',a,mae)
w=np.linalg.solve(Ztr.T@Ztr+a*np.eye(Ztr.shape[1]),Ztr.T@(ytr-ym)); pred=Zte@w+ym
print('test',float(np.mean(np.abs(pred-yte))),'const',float(np.mean(np.abs(yte-ym))),'bias',float(np.mean(pred-yte)))
for src in ['A','B']:
 mask=np.array([r['source']==src for r in test]); print(src,'n',mask.sum(),'MAE',float(np.mean(np.abs(pred[mask]-yte[mask]))),'const',float(np.mean(np.abs(yte[mask]-ym))))
json.dump({'alpha':a,'cv_mae':mae,'test_mae':float(np.mean(np.abs(pred-yte))),'constant_mae':float(np.mean(np.abs(yte-ym))),'n_train':len(tr),'n_test':len(te),'mu':mu.tolist(),'sd':sd.tolist(),'coef':w.tolist(),'intercept':ym,'test_ids':[r['animal_id'] for r in test]},open('models/train_embed_result.json','w'))
