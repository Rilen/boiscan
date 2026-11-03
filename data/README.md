# Dados experimentais — BoiScan

Esta pasta contém **apenas contratos e templates**. Nenhuma foto, pesagem real ou
dado de propriedade está incluída no repositório.

O motor experimental depende de um dataset com pares confiáveis:

```text
foto lateral + máscara/silhueta + escala física + peso real de balança
```

Sem esses dados, o BoiScan não calcula peso. O pipeline pode extrair características
da imagem, mas não há coeficiente de peso defensável.

## Arquivos

- `templates/collection.template.csv`: uma linha por foto, com metadados de captura,
  escala, pesagem, consentimento e split.
- `templates/features.template.csv`: entrada do treinador, derivada das fotos após
  extração morfométrica. Não contém imagens.

## Regras de coleta

1. **Pseudonimização**: `animal_id` e `farm_id` são códigos, nunca nome, CPF, telefone,
   coordenadas ou endereço. Não fotografar pessoas, placas ou documentos.
2. **Peso real**: `live_weight_kg` vem de balança calibrada; `weighed_at` próximo da
   foto; `weight_source` identifica o equipamento/protocolo.
3. **Escala física**: usar marcador de tamanho conhecido no mesmo plano do animal.
   Registrar `scale_reference_type`, comprimento conhecido, incerteza e dois pontos
   normalizados (0–1) sobre a imagem. Sem escala no mesmo plano, não há peso absoluto.
4. **Máscara**: `mask_path` aponta para anotação fora do Git. A máscara deve conter
   somente o animal; oclusões e animais cortados devem ser registrados.
5. **Consentimento**: `consent_reference` identifica a autorização de uso (documento
   pseudônimo ou termo). `license` define o uso permitido dos dados/fotos.
6. **Split**: `train`, `validation` ou `test`. O mesmo animal **nunca** pode aparecer
   em mais de um split; a mesma propriedade também não pode vazar entre treino e
   teste. O treinador recusa vazamento.
7. **Retenção**: imagens e dados brutos ficam em `data/private/` (ignorado pelo Git)
   ou fora do repositório. Excluir quando o consentimento expirar.
8. **Unidades**: pesos em kg; medidas em cm; áreas em cm².
9. **Qualidade**: registrar ângulo, oclusão, iluminação e imagem cortada. Uma foto
   tecnicamente nítida pode ser inutilizável se o animal não estiver inteiro.

## Como o treino é separado

O baseline usa regressão ridge sobre características morfométricas físicas.
O treinador exige três propriedades distintas (uma por split), no mínimo 60 registros
e 30 animais para dados reais. Esses números são **guardrails de pipeline**, não uma
garantia de poder estatístico; o piloto deve ser maior e acordado com responsável
técnico.

Para uma validação independente de verdade, a coorte de teste deve ser coletada em
outra propriedade e período, e congelada antes do ajuste de hiperparâmetros. Métricas
de teste não podem ser usadas para escolher o modelo final.

## Licenças

- Dados sintéticos gerados por `npm run experimental:demo`: declaração `CC0-1.0`,
  apenas demonstração técnica; não representam animais.
- Fotos/dados reais: a licença precisa ser registrada por registro e verificada
  antes de qualquer treinamento. Não usar imagens baixadas da internet sem direito
  explícito.
- Nenhum modelo de terceiros é incluído nesta pasta.

## Estado atual

A extração de características e o treinador estão implementados e testados. A tela
de anotação/exportação de features no navegador ainda não foi ligada ao app público;
a biblioteca local está em `src/experimental/`. O bloqueio para uma estimativa real é
a ausência de um dataset licenciado com pesagens reais e escala calibrada.
