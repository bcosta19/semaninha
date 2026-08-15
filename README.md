# semaninha

Uma página única que consulta a semana mais recente do Last.fm e monta uma arte com os álbuns e as faixas mais ouvidos.

O projeto é estático e usa uma Cloudflare Pages Function para manter a chave da API do Last.fm no servidor. O histórico só aparece se a conta tiver o Spotify conectado ao Last.fm (ou outra fonte de scrobbling configurada).

## Rodar localmente

1. Crie uma chave em [last.fm/api/account/create](https://www.last.fm/api/account/create).
2. Instale as dependências e crie um arquivo `.dev.vars`:

   ```text
   LASTFM_API_KEY=sua_chave_aqui
   ```

3. Inicie o Pages localmente:

   ```bash
   npm install
   npm run dev
   ```

## Publicar no Cloudflare Pages

No projeto do Pages, configure:

- **Build command:** deixe vazio (não há etapa de build).
- **Build output directory:** `.`
- **Environment variable:** `LASTFM_API_KEY` como variável secreta, tanto em Preview quanto em Production.

Ao usar a integração com GitHub, selecione este repositório e mantenha as mesmas configurações. Cada novo push na branch configurada dispara uma nova publicação; a chave deve ser cadastrada no Cloudflare, nunca no repositório.

No painel do Cloudflare Pages, em **Settings > Environment variables**, adicione `LASTFM_API_KEY` como variável **Secret** nos ambientes **Production** e **Preview**. Depois de salvar a variável, faça um novo deploy para que a Function possa recebê-la.

O diretório `functions/` é detectado automaticamente pelo Pages. Para publicar pela CLI, depois de autenticar no Wrangler:

```bash
npm run deploy -- --project-name semaninha
```

## Limites do MVP

O Last.fm fornece os dados de escuta e as capas disponíveis no chart. A aplicação não acessa uma conta Spotify diretamente; ela representa os scrobbles que chegaram ao Last.fm.
