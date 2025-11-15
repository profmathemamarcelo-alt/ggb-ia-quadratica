# Laboratório de Função Quadrática – GeoGebra + IA

Aplicação web para explorar **funções quadráticas** no GeoGebra com apoio de uma **IA tutora**.  
O estudante manipula os parâmetros da função no GeoGebra (coeficientes, raízes, vértice, área etc.) e conversa com a IA, que:

- lê o estado atual da construção (a, b, c, vértice, raízes, área);
- explica o gráfico em linguagem natural;
- propõe desafios (ex.: “traduza o gráfico 2 unidades para cima”);
- pode ajustar alguns elementos do GeoGebra via comandos.

Projeto pensado para uso em sala de aula, reforço escolar e experimentos didáticos.

---

## Tecnologias

- **Frontend**
  - HTML, CSS, JavaScript puro
  - GeoGebra embutido via `deployggb.js` e arquivo `quadratica.ggb`

- **Backend**
  - Node.js + Express
  - Integração com API da OpenAI (modelo de linguagem)
  - Comunicação via endpoint REST `/api/ai`

---

## Estrutura do projeto

```text
ggb-ia-quadratica/
  backend/
    server.js
    package.json
    .env.example   # modelo de variáveis de ambiente (sem segredos)
  frontend/
    index.html     # layout principal (GeoGebra + chat)
    main.js        # lógica de integração GeoGebra ↔ IA
    style.css      # layout e estilo da interface
    quadratica.ggb # construção do GeoGebra
