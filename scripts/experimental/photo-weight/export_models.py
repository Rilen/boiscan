import os, torch, onnxruntime as ort, numpy as np
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(ROOT,'models'),exist_ok=True)
backbone=mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT).features.eval()
model=torch.nn.Sequential(backbone, torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten()).eval()
dummy=torch.zeros(1,3,224,224)
path=os.path.join(ROOT,'models','mobilenet_v3_small_features.onnx')
torch.onnx.export(model,dummy,path,input_names=['input'],output_names=['features'],opset_version=18,do_constant_folding=True, external_data=False)
sess=ort.InferenceSession(path,providers=['CPUExecutionProvider'])
out=sess.run(None,{'input':np.zeros((1,3,224,224),np.float32)})[0]
print('onnx',path,os.path.getsize(path),'shape',out.shape,'dtype',out.dtype)
