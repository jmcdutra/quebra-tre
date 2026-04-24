# quebra-tre

## Env

Crie ou ajuste `.env.local` com:

```env
DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/NOME_DO_BANCO?sslmode=require"
ADMIN_PASSWORD="tremelhorcia"
ADMIN_PANEL_USER="Treinadores"
ADMIN_PANEL_PASSWORD="tremelhorcia"
```

Se o PostgreSQL for local e sem SSL:

```env
DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/quebra_tre"
ADMIN_PASSWORD="tremelhorcia"
ADMIN_PANEL_USER="Treinadores"
ADMIN_PANEL_PASSWORD="tremelhorcia"
```

## Prisma com PostgreSQL

Gerar client:

```bash
npx prisma generate
```

Criar migration localmente:

```bash
npx prisma migrate dev --name init
```

Aplicar em producao/VPS:

```bash
npx prisma migrate deploy
```

Se quiser apenas sincronizar o schema no banco sem criar migration agora:

```bash
npx prisma db push
```

## Desenvolvimento

```bash
npm run dev
```
