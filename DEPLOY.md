# Deploy em VPS

Docker Compose com Caddy (HTTPS), a API e PostgreSQL 16. O frontend continua na Vercel.

## 1. Contratar a VPS

VPS da Hostinger. No hPanel, escolha o sistema **Ubuntu 24.04** "puro" (sem painel de controle) e o
datacenter do Brasil. Cadastre uma chave SSH (`ssh-keygen -t ed25519` na sua máquina; cole o
`.pub`) ou defina uma senha forte de root. O IP aparece na página da VPS.

## 2. DNS

No hPanel, em *Domínios → seu domínio → DNS / Nameservers*, crie um registro **A**: nome `api`, valor o IP da VPS.
Confira com `nslookup api.SEUDOMINIO` antes de subir; sem isso o certificado não é emitido.

## 3. Preparar o servidor

```bash
ssh root@IP_DA_VPS
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

Se ativar o firewall do hPanel (*VPS → Segurança → Firewall*), libere 22, 80 e 443 nele também.

## 4. Baixar o código

```bash
git clone https://github.com/joaocampos03/backend-anti-aposta.git
cd backend-anti-aposta
```

Repositório privado: gere uma chave no servidor (`ssh-keygen -t ed25519`), adicione o `.pub` em
*Settings → Deploy keys* (somente leitura) e clone por
`git@github.com:joaocampos03/backend-anti-aposta.git`.

## 5. Configurar

```bash
cp env.production.example .env
chmod 600 .env
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -base64 32   # OPEN_FINANCE_TOKEN_KEY
openssl rand -base64 24   # OPEN_FINANCE_CLIENT_SECRET
nano .env
```

A API não sobe enquanto `TURNSTILE_SECRET_KEY` estiver vazia. Use a chave que corresponde à
`TURNSTILE_SITE_KEY` do frontend.

```bash
# confere API_DOMAIN, POSTGRES_PASSWORD e a sintaxe; o resto a API valida ao subir (veja os logs)
docker compose -f docker-compose.prod.yml config -q
```

## 6. Subir

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api      # espere "api listening"
curl https://api.SEUDOMINIO/health
curl https://api.SEUDOMINIO/ready
```

## 7. Dados de demonstração

O banco começa vazio. O seed cria a usuária `ana@exemplo.com` / `quatro palavras comuns`, um ano de
extrato, as casas de aposta e os itens de referência:

```bash
docker compose -f docker-compose.prod.yml exec api npm run db:seed
```

Essas credenciais são públicas (estão no repositório).

## 8. Apontar o frontend

Na Vercel, em *Settings → Environment Variables* do frontend, defina
`BACKEND_API_URL=https://api.SEUDOMINIO` (sem barra no final) e faça um **redeploy**.

## Operação

```bash
# atualizar
git pull && docker compose -f docker-compose.prod.yml up -d --build

# depois de editar o .env
docker compose -f docker-compose.prod.yml up -d

# backup do banco
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres antiapostadb > backup.sql
```

- **Nunca** use `down -v`: o `-v` apaga o banco e os certificados.
- Não troque `OPEN_FINANCE_TOKEN_KEY` depois de haver consentimentos: os tokens gravados deixam de
  ser decifrados.
- `POSTGRES_PASSWORD` só vale na primeira criação do volume; mudar no `.env` depois não altera a
  senha do banco.
