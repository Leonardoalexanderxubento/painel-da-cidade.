# 🏙️ Painel da Cidade

Dashboard que junta **dados públicos e abertos** da sua cidade numa tela só e **se atualiza sozinho a cada 10 minutos**:

| Card | O que mostra | Fonte |
|---|---|---|
| **Agora** | temperatura, sensação, umidade, vento, chuva, UV, nascer/pôr do sol | [Open-Meteo Forecast](https://open-meteo.com/en/docs) |
| **Próximas 24 h** | curva de temperatura + chance de chuva por hora | Open-Meteo Forecast |
| **7 dias** | mínima/máxima e chance de chuva por dia | Open-Meteo Forecast |
| **Qualidade do ar** | US AQI, PM2.5, PM10, O₃, NO₂ e previsão horária do índice | [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) (modelo CAMS) |
| **Bicicletas compartilhadas** | bikes livres, elétricas, vagas e mapa de estações em tempo real | [CityBikes API](https://api.citybik.es/v2/) |
| **Próximos feriados** | feriados nacionais/regionais e quantos dias faltam | [Nager.Date](https://date.nager.at/) |
| **Por perto** | pontos de interesse com artigo na Wikipédia num raio de 10 km | [API MediaWiki (geosearch)](https://www.mediawiki.org/wiki/API:Geosearch) |

Funciona para **qualquer cidade do mundo** (busca no topo da página). A cidade escolhida fica na URL, então dá para compartilhar um link direto, por exemplo `?name=Recife&cc=BR&lat=-8.05&lon=-34.88`.

> Todas as APIs são gratuitas, **não exigem chave** e liberam CORS. Por isso o projeto é 100% estático: nenhum segredo no repositório e hospedagem grátis no GitHub Pages.

## Destaques técnicos

- **JavaScript puro com ES Modules**, sem framework e sem etapa de build.
- **Gráficos SVG feitos à mão** (`js/charts.js`) com tooltip/crosshair no hover e no toque, eixo único e rótulos diretos só no máximo/mínimo.
- **Resiliente**: as requisições rodam em paralelo com `Promise.allSettled` e timeout via `AbortController`. Se uma API cai, só aquele card mostra o erro e os outros continuam.
- **Cache** em `sessionStorage` para dados que mudam pouco (lista de ~800 redes de bike, feriados).
- **Atualização automática** a cada 10 min, pausada quando a aba fica oculta e refeita ao voltar se os dados estiverem velhos.
- **Dados geoespaciais**: a rede de bikes mais próxima e a distância até as estações e lugares são calculadas com a fórmula de haversine.
- **Tema claro/escuro** automático, layout responsivo (funciona no celular) e cores de status sempre acompanhadas de rótulo.
- **Testes unitários** com `node:test` para toda a lógica de dados (`js/data.js`), rodando no **GitHub Actions** antes de cada deploy.

## Estrutura

```
index.html            # estrutura da página
css/style.css         # tema, grade e componentes
js/api.js             # chamadas às APIs (timeout, cache, normalização)
js/data.js            # funções puras: AQI, WMO, haversine, recortes de séries
js/charts.js          # gráficos de linha e barras em SVG
js/main.js            # estado, renderização dos cards, busca e auto-refresh
tests/data.test.js    # testes unitários
.github/workflows/    # CI + deploy no GitHub Pages
```

## Rodando localmente

Precisa só do Node 18+ (para o servidor estático e os testes):

```bash
npm start      # abre em http://localhost:5173
npm test       # roda os testes
```

> Abrir o `index.html` direto com dois cliques não funciona, porque navegadores bloqueiam ES Modules em `file://`. Use `npm start` ou qualquer servidor estático.

## Publicando no GitHub Pages

1. Crie um repositório no GitHub e faça push da branch `main`.
2. No repositório, vá em **Settings → Pages → Build and deployment → Source** e escolha **GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` roda os testes e publica o site a cada push. A URL aparece na aba **Actions** e fica algo como `https://<seu-usuario>.github.io/<repo>/`.

## Ideias para evoluir

- Guardar um histórico (ex.: um GitHub Action agendado que salva o AQI a cada hora num JSON) e mostrar tendências.
- Transporte público em tempo real via GTFS-RT ou a API Olho Vivo da SPTrans (essa exige token, então precisaria de um pequeno backend/proxy).
- Eventos culturais via APIs como Ticketmaster ou Sympla (também exigem chave).
- Transformar em PWA para instalar no celular.

## Licença

MIT. Os dados pertencem às respectivas fontes; consulte os termos de uso de cada uma.
