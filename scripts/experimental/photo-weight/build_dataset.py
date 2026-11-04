import csv, json, os, hashlib
from PIL import Image, ImageOps
import numpy as np

A_ROOT='/home/rtl/Downloads/Cattle side view and back view dataset/Cattle side and back view images/side view'
B_ROOT='/home/rtl/Downloads/Multi-View Cow Image Dataset for AI-Based Weight E/Cow_Images/Angle1'
A_LABELS='/home/rtl/Documentos/GitHub/boiscan-audit-007/measurements_clean.tsv'
B_LABELS='/home/rtl/Documentos/GitHub/boiscan-benchmark-008/B_labels_metadata.json'
OUT='data'
os.makedirs(OUT,exist_ok=True)

def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1<<20),b''): h.update(b)
 return h.hexdigest()

aweights={}
for r in csv.DictReader(open(A_LABELS),delimiter='\t'):
 aweights[int(r['num'])]=float(r['weight'])
rows=[]
for n,w in sorted(aweights.items()):
 p=os.path.join(A_ROOT,f'{n}.png')
 if not os.path.exists(p): continue
 rows.append({'animal_id':f'A-{n:02d}','source':'A','image':p,'weight_kg':w,'sha256':sha(p),'role':'side'})
bl=json.load(open(B_LABELS))['labels']
for r in bl:
 n=int(r['cow_id']); w=float(r['weight_kg']); p=os.path.join(B_ROOT,f'cow_{n:04d}_angle1.jpg')
 if not os.path.exists(p): raise SystemExit(p)
 rows.append({'animal_id':f'B-{n:04d}','source':'B','image':p,'weight_kg':w,'sha256':sha(p),'role':'Angle1'})
# deterministic stratified split by animal: 20% test, 15% val, rest train
import random
random.seed(1201)
for src in ['A','B']:
 ids=sorted([r['animal_id'] for r in rows if r['source']==src])
 random.shuffle(ids)
 ntest=max(1,round(len(ids)*0.2)); nval=max(1,round(len(ids)*0.15))
 for i,r in enumerate(rows):
  if r['source']!=src: continue
  pos=ids.index(r['animal_id'])
  r['split']='test' if pos<ntest else ('val' if pos<ntest+nval else 'train')
with open(os.path.join(OUT,'dataset.json'),'w') as f: json.dump(rows,f,indent=2)
from collections import Counter
print('rows',len(rows),Counter((r['source'],r['split']) for r in rows))
print('weights',min(r['weight_kg'] for r in rows),max(r['weight_kg'] for r in rows))
