# Treino do modelo fotográfico experimental

Scripts usados na Missão 012. Não são executados em CI nem carregam dados para o bundle público.

- `build_dataset.py`: junta A (medidas da auditoria 007) + B (`Angle1`) por animal; split por animal.
- `train_embed.py`: extrai embeddings MobileNetV3-small (torchvision) e ajusta ridge; gera `train_embed_result.json`.
- `export_models.py`: exporta o backbone de features para ONNX.

Os caminhos absolutos apontam para os datasets locais e são intencionais para reprodutibilidade neste ambiente; ajuste-os para outra máquina. O modelo publicado é `public/models/photo-weight-v1.json`; os dados de treino não são versionados.
