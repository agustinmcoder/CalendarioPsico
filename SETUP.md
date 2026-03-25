# Psico Agenda — Guía de Deploy

## Estructura del proyecto

```
Calendario Psico/
├── backend/          → Node.js + Express (va a Render)
├── frontend/         → HTML/CSS/JS (va a Netlify)
├── render.yaml       → Configuración de Render
├── .gitignore
└── SETUP.md
```

---

## Paso 1 — Base de datos PostgreSQL

Tenés dos opciones gratuitas:

### Opción A: Supabase (recomendada, gratis para siempre)
1. Crear cuenta en [supabase.com](https://supabase.com)
2. Crear nuevo proyecto
3. Ir a **Settings > Database > Connection string > URI**
4. Copiar la cadena de conexión (empieza con `postgresql://...`)

### Opción B: Render PostgreSQL
1. En Render, crear **New > PostgreSQL**
2. Copiar la "External Database URL"

---

## Paso 2 — Backend en Render

1. Subir el código a GitHub
2. Entrar a [render.com](https://render.com)
3. **New > Web Service** → conectar con tu repo de GitHub
4. Configurar:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. En **Environment Variables**, agregar:
   - `DATABASE_URL` → la URL de PostgreSQL del Paso 1
   - `APP_PASSWORD` → `Juanita`
   - `TOKEN_SECRET` → cualquier string largo (ej: `mi-secreto-super-seguro-2024`)
   - `FRONTEND_URL` → la URL de tu Netlify (la obtenés en el Paso 3)
6. Hacer deploy. Copiar la URL del backend (ej: `https://psico-calendar-backend.onrender.com`)

---

## Paso 3 — Frontend en Netlify

### Actualizar la URL del backend

Antes de subir, abrir **dos archivos** y reemplazar `TU-APP`:

**`frontend/js/config.js`** — línea 5:
```js
const API_URL = window.BACKEND_URL || 'https://psico-calendar-backend.onrender.com';
```

**`frontend/_redirects`**:
```
/api/* https://psico-calendar-backend.onrender.com/api/:splat 200
```

### Deploy en Netlify
1. Entrar a [netlify.com](https://netlify.com)
2. **Add new site > Deploy manually** o conectar con GitHub
3. Si es manual: arrastrar la carpeta `frontend/` al panel de Netlify
4. Si es por GitHub: seleccionar el repo y configurar:
   - **Publish directory:** `frontend`
5. Copiar la URL de Netlify (ej: `https://psico-agenda.netlify.app`)
6. Volver a Render y agregar esa URL como `FRONTEND_URL`

---

## Listo

Abrir la URL de Netlify, ingresar contraseña `Juanita`, y ya podés usar la app.

---

## Desarrollo local

```bash
# Backend
cd backend
cp .env.example .env
# Editar .env con tus datos
npm install
npm run dev

# Frontend
# Abrir frontend/index.html con Live Server en VS Code
# O cualquier servidor HTTP local en el puerto 5500
```

En `frontend/js/config.js`, cambiar la URL a `http://localhost:3000` para desarrollo local.
