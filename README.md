# Plotwise

> Le copilote d'écriture qui *comprend* l'histoire.

Plotwise est une application web pour auteurs de romans, sagas et scénarios. Elle analyse le manuscrit en continu grâce à l'IA et construit automatiquement une **bible vivante** de l'univers narratif (personnages, lieux, événements, relations) sans aucune saisie manuelle. Elle détecte les incohérences en temps réel et répond aux questions de l'auteur en s'appuyant sur l'intégralité du texte.

---

## Fonctionnalités

- **Éditeur trois panneaux** - zone d'écriture centrale, sidebar chapitres, panneau contextuel IA en direct
- **Extraction automatique** - à chaque sauvegarde de chapitre, Claude identifie les personnages présents, les nouveaux attributs déclarés, les événements et les évolutions de relations
- **Bible vivante** - fiches personnages, lieux et objets générées et maintenues par l'IA, consultables depuis les dashboards
- **Détection d'incohérences** - si un fait contredit un fait antérieur (couleur des yeux, rang social, chronologie…), Plotwise le signale avec les deux passages en regard
- **Recherche sémantique** - retrouver n'importe quel passage du manuscrit par sens, pas par mot-clé exact
- **Assistant conversationnel** - répondre à des questions sur l'histoire ("où est Liora au chapitre 12 ?", "quels personnages connaissent ce secret ?") en streaming, avec les extraits sources cités

---

## Architecture

Plotwise est structuré en deux packages indépendants :

```
plotwise/
├── backend/   # API Fastify + pipeline IA
└── frontend/  # Application React
```

### Backend - `backend`

| Couche | Choix | Rôle |
|---|---|---|
| Runtime | Node.js 20 + TypeScript (strict, ESM) | Typage fort sur les payloads IA |
| HTTP | Fastify | Rapide, SSE natif, plugins solides |
| Base de données | MongoDB + Mongoose | Documents imbriqués adaptés à la bible narrative |
| Vecteurs | MongoDB Atlas Vector Search | RAG dans le même service que les données |
| LLM | Anthropic (multi-modèles) | Extraction, cohérence, résumés, assistant |
| Embeddings | Voyage AI — `voyage-3-large` | Recommandé par Anthropic |
| Validation | Zod | Sécurité à l'exécution sur toutes les entrées |

**Sélection des modèles par tâche :**

| Tâche | Modèle | Raison |
|---|---|---|
| Extraction d'entités | `claude-sonnet-4-20250514` | Rapide, `tool_use` structuré |
| Détection d'incohérences | `claude-opus-4-20250514` | Raisonnement nuancé requis |
| Résumés de chapitres | `claude-haiku-4-5-20251001` | Économique pour un résultat simple |
| Assistant conversationnel | `claude-sonnet-4-20250514` | Streaming SSE fluide |

**Le pipeline d'analyse** - ce qui se passe à chaque sauvegarde de chapitre :

```
PUT /v1/chapters/:id/content
  → debounce 4s
  → analyzeChapter()
      1. Compiler la bible en résumé compact (~2-3k tokens)
      2. Extraire les entités (Sonnet + tool_use)
      3. Détecter les contradictions (Opus)
      4. Fusionner dans la bible
      5. Re-chunker et re-indexer pour le RAG
```

**Structure du code :**

```
src/
├── config.ts
├── db.ts
├── server.ts
├── models/index.ts          # Schémas Mongoose (Project, Chapter, Character…)
├── ai/
│   ├── client.ts            # Singleton SDK Anthropic
│   ├── prompts.ts           # System prompts + tool schemas
│   ├── extraction.ts        # Chapitre → ExtractionResult
│   ├── consistency.ts       # Paire de faits → verdict
│   ├── embeddings.ts        # Chunking + Voyage AI
│   └── assistant.ts         # Streaming SSE
├── services/
│   ├── bibleService.ts      # Orchestrateur principal
│   ├── analysisQueue.ts     # File en mémoire avec debounce
│   └── rag.ts               # Atlas Vector Search
└── routes/
    ├── projects.ts
    ├── chapters.ts
    ├── bible.ts
    ├── inconsistencies.ts
    ├── search.ts
    └── assistant.ts

scripts/
└── createIndexes.ts         # Création des index Atlas (one-time)
```

### Frontend - `frontend`

| Couche | Choix |
|---|---|
| Build | Vite 5 + TypeScript strict |
| UI | React 18 |
| Routing | React Router 6 |
| État serveur | TanStack Query 5 |
| Styles | CSS plain avec variables - aucun framework |

**Pages :**

| Route | Page |
|---|---|
| `/` | Liste des projets |
| `/projects/:id/manuscript` | Éditeur trois panneaux (écriture + contexte IA) |
| `/projects/:id/bible` | Bible - fiches personnages, lieux, objets |
| `/projects/:id/inconsistencies` | Liste des incohérences détectées |
| `/projects/:id/assistant` | Chat avec l'IA sur l'histoire |

---

## Démarrage rapide

### Prérequis

- Node.js 20+
- Compte [MongoDB Atlas](https://cloud.mongodb.com) (tier M0 gratuit suffisant pour le dev)
- Clé API [Anthropic](https://console.anthropic.com)
- Clé API [Voyage AI](https://dash.voyageai.com)

### Backend

```bash
cd plotwise-backend
cp .env.example .env
# Remplir : MONGO_URI, ANTHROPIC_API_KEY, VOYAGE_API_KEY
npm install
npm run indexes   # Création de l'index vectoriel Atlas (une seule fois)
npm run dev       # http://localhost:3001
```

Vérification : `curl http://localhost:3001/healthz`

### Frontend

```bash
cd plotwise-frontend
cp .env.example .env
# Remplir : VITE_DEV_USER_ID=<id_mongo_user>
npm install
npm run dev       # http://localhost:5173
```

---

## Variables d'environnement

### Backend (`.env`)

| Variable | Description | Exemple |
|---|---|---|
| `MONGO_URI` | URI de connexion Atlas | `mongodb+srv://user:pass@cluster.mongodb.net/plotwise` |
| `ANTHROPIC_API_KEY` | Clé API Anthropic | `sk-ant-…` |
| `VOYAGE_API_KEY` | Clé API Voyage AI | `pa-…` |
| `PORT` | Port d'écoute | `3001` |
| `LOG_LEVEL` | Niveau de log Pino | `info` |
| `NODE_ENV` | Environnement | `development` \| `production` |

### Frontend (`.env`)

| Variable | Description | Exemple |
|---|---|---|
| `VITE_API_URL` | URL du backend | `http://localhost:3001` |
| `VITE_DEV_USER_ID` | ID Mongo d'un user existant (dev sans auth) | `664f3a…` |

---

## Points de conception importants

**Pourquoi trois couches de stockage ?**
Un seul grand fichier est trop coûteux à envoyer à chaque requête IA. Des fichiers séparés par chapitre perdent la cohérence transverse. Plotwise sépare : (1) le texte brut par chapitre (source de vérité), (2) une bible structurée compacte alimentant les dashboards, (3) un index sémantique pour le RAG ciblé. Le coût et la latence restent constants quelle que soit la longueur du manuscrit.

**Pourquoi `tool_use` pour l'extraction ?**
Forcer un schéma de sortie via `tool_use` est plus fiable que demander du JSON en texte libre. Claude retourne toujours la structure attendue, ce qui évite le parsing défensif et les hallucinations de format.

**File d'analyse en mémoire**
`analysisQueue.ts` est une file en mémoire avec debounce de 4 secondes - suffisant pour le développement. En production, remplacer par BullMQ + Redis pour la persistance des jobs entre redémarrages.

---

## Limites connues / roadmap

- Authentification en mode dev uniquement (`Authorization: Dev <userId>`) // à remplacer par JWT / OAuth en production
- File d'analyse en mémoire — pas de persistance entre redémarrages du serveur
- Pas de quotas par utilisateur sur les appels Anthropic
- Nettoyage des attributs orphelins après suppression d'un chapitre non implémenté
- Export de la bible (PDF / Markdown) prévu mais absent

---

## Stack résumée

```
Frontend          Backend           IA & Data
─────────         ───────           ─────────
React 18          Fastify           Anthropic (multi-modèles)
React Router 6    TypeScript ESM    Voyage AI (embeddings)
TanStack Query    Mongoose          MongoDB Atlas
Vite 5            Zod               Atlas Vector Search
```