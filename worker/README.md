# TestoLab AI — servidor gratuito

Este Worker faz a ponte entre o TestoLab, o Gemini Developer API e o PubMed (NCBI E-utilities).

## Privacidade
- Recebe apenas valores numéricos, unidades permitidas e faixas numéricas.
- Não recebe nome, CPF, e-mail, telefone, data de nascimento, data/hora da coleta, composto, observações, foto ou PDF.
- Não grava exames em banco de dados nem em logs intencionais.
- O Gemini no nível gratuito pode usar conteúdo enviado para melhorar produtos do Google. O usuário deve avaliar essa condição antes de ativar.
- A chave Gemini fica somente no segredo GEMINI_API_KEY do Worker, nunca no app ou GitHub.

## Implantação pelo painel Cloudflare (sem terminal)
1. Crie/entre em https://dash.cloudflare.com/ e abra **Workers & Pages**.
2. Crie um Worker chamado **testolab-ai**.
3. Abra **Edit code** e substitua o conteúdo por `src/index.js` deste diretório.
4. Em **Settings > Variables and Secrets**, adicione um segredo chamado `GEMINI_API_KEY` com sua chave criada em https://aistudio.google.com/app/apikey.
5. Em **Variables**, adicione `GEMINI_MODEL` com valor `gemini-3.5-flash-lite` (ou outro modelo gratuito habilitado na sua conta).
6. Faça Deploy. Copie o endereço público do Worker, por exemplo `https://testolab-ai.<seu-subdominio>.workers.dev`.
7. No TestoLab, abra **Dados > Configuração da IA**, cole o endereço e teste a conexão.

## Endpoints
- GET /health
- POST /interpret

Origens permitidas por padrão: GitHub Pages deste projeto e localhost do Capacitor. Se o domínio do app mudar, ajuste ALLOWED_ORIGINS em src/index.js.

## Limites
O Worker aplica um limite simples de 5 chamadas por minuto por IP por instância. É uma proteção básica, não substitui autenticação nem proteção robusta contra abuso. O plano gratuito do Workers tem limites próprios; o Gemini gratuito tem cotas e modelos sujeitos a mudanças.
