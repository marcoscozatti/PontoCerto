# PontoCerto

App de registro de ponto com sistema paralelo de justificativas (atraso, saída
antecipada, entrada antecipada, outros), histórico e relatório mensal para envio ao RH.

## Estrutura

```
pontocerto/
├── index.html          → app inteiro (login, home, registrar, histórico, relatório)
├── css/style.css        → visual (vinho + dourado, como no seu app de referência)
├── js/supabase-config.js → credenciais do Supabase (você precisa preencher)
├── js/app.js             → toda a lógica (auth, marcações, relatório)
├── sql/schema.sql        → script para criar a tabela no Supabase
└── README.md
```

## Como colocar no ar (5 passos)

**1. Crie o projeto no Supabase**
Acesse https://supabase.com → "New project" → escolha nome, senha do banco e região.

**2. Rode o schema**
No painel do projeto, vá em **SQL Editor → New query**, cole o conteúdo de
`sql/schema.sql` e clique em **Run**. Isso cria a tabela `marcacoes` já com as
permissões (RLS) para que cada usuário só veja as próprias marcações.

**3. Pegue suas chaves**
Vá em **Project Settings → API** e copie:
- **Project URL**
- **anon public key**

**4. Configure o app**
Abra `js/supabase-config.js` e substitua:
```js
const SUPABASE_URL = 'COLE_AQUI_A_SUA_PROJECT_URL';
const SUPABASE_ANON_KEY = 'COLE_AQUI_A_SUA_ANON_KEY';
```

**5. Abra o `index.html`**
Pode abrir direto no navegador (duplo clique) ou publicar em qualquer hospedagem
estática (Vercel, Netlify, GitHub Pages, ou até um bucket S3). Na primeira vez,
clique em "Criar conta" para se cadastrar com e-mail e senha.

> Dica: por padrão o Supabase exige confirmação de e-mail antes do primeiro
> login. Se quiser testar rapidamente sem configurar envio de e-mail, vá em
> **Authentication → Settings** e desative "Confirm email".

## Como o sistema de justificativas funciona

- Toda marcação (entrada/saída) pode receber uma **Categoria** opcional:
  Entrada antecipada, Saída antecipada, Atraso ou Outro — mais uma descrição
  livre. Isso é registrado **no ato**, junto com a marcação, então funciona
  como o "sistema paralelo" que você pediu: a ocorrência já fica documentada
  na hora, sem depender de lembrar disso depois.
- No **Relatório Mensal**, todas as marcações do mês (com ou sem categoria)
  aparecem numa tabela pronta para conferência. Você escolhe mês/ano, pode
  **exportar em PDF** (usa a função de impressão do navegador, então dá pra
  salvar como PDF) ou **enviar por e-mail** (abre seu cliente de e-mail com
  o relatório já preenchido no corpo da mensagem, pronto para mandar ao RH
  no início do mês seguinte).

## Minha Conta

Tela para guardar **nome completo** e **registro (matrícula/ID)** — usados
para preencher automaticamente a Carta de Compensação — e trocar a senha da
conta. Preencha isso antes de usar a Carta de Compensação.

## Preencher PDF do RH automaticamente

No Relatório Mensal, é possível subir o PDF "Relatório de Justificativa de
Ponto" da Senac (modelo RVE0202R). O app:
- Preenche o campo **Motivo** nas datas que já pedem justificativa e que têm
  descrição registrada no PontoCerto.
- Nos dias marcados como **"Ímpar"**, preenche as colunas 1ªMar–8ªMar com os
  horários que você registrou no PontoCerto mas que não aparecem no relógio
  eletrônico (comparação com tolerância de 10 minutos).

Tudo roda no seu navegador — nada é enviado a nenhum servidor.

## Carta de Compensação de Horas (Excel)

Reaproveita os dias marcados como **"Débito"** no mesmo PDF processado acima
(usa o valor de "Saldo do dia" de cada um) para preencher automaticamente a
planilha modelo de Carta de Compensação: data de hoje, nome/registro (de
"Minha Conta") e uma linha por dia de débito (data + horas + minutos). Baixe
a carta pronta para assinar e entregar. **Processe o PDF do RH antes de usar
esta seção.**

## Possíveis próximos passos

- Geolocalização real no botão "Marcar" (hoje o ícone é só visual).
- Aprovação do RH: um segundo papel de usuário que marca marcações como
  "justificado" depois de revisar.
- Notificação por e-mail automática (via Supabase Edge Function) todo início
  de mês, lembrando de enviar o relatório.

Peça que eu implemente qualquer um desses quando quiser evoluir o app.

## Login com Google (opcional)

Além de e-mail/senha, o app agora tem um botão "Entrar com o Google" na tela de
login. Para funcionar, é preciso configurar em dois lugares:

1. **Google Cloud Console** (console.cloud.google.com): crie um OAuth Client ID
   (tipo "Web application") e, em "Authorized redirect URIs", adicione:
   ```
   https://SEU-PROJETO.supabase.co/auth/v1/callback
   ```
   (troque pelo seu Project URL do Supabase). Copie o Client ID e Client Secret.

2. **Painel do Supabase**: Authentication → Providers → Google → ative e cole
   o Client ID/Secret. Depois, em Authentication → URL Configuration, adicione
   a URL onde o app roda (ex.: `http://127.0.0.1:5500` para testes locais, e a
   URL real depois de hospedar) em "Redirect URLs".

Sem essa configuração, o botão aparece mas mostra um erro ao clicar — o login
por e-mail/senha continua funcionando normalmente enquanto isso.

## Banco de Horas (Dashboard)

Toda vez que você processa um PDF do RH no Relatório Mensal, o saldo de cada
dia (positivo, negativo ou neutro) é importado automaticamente para uma nova
tabela no Supabase (`banco_horas_dias`). A tela **Banco de Horas** (no menu
principal) mostra:
- Saldo atual acumulado, em destaque
- Gráfico de evolução do saldo ao longo do tempo
- Os 5 maiores créditos e os 5 maiores débitos
- Resumo mês a mês, com saldo do mês e saldo acumulado

**Importante:** rode o bloco novo do `sql/schema.sql` (tabela
`banco_horas_dias`) no SQL Editor do Supabase antes de usar essa tela, caso
seu projeto já existisse antes dessa atualização.
