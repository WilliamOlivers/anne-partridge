# Guide de mise en ligne — Anne Partridge

## Ce que vous avez

Un site statique HTML/CSS complet avec :
- 16 pages HTML
- Panneau d'administration Decap CMS (`/admin`) pour qu'Anne puisse éditer elle-même
- Hébergement Vercel (gratuit)

---

## Étape 1 — Créer le dépôt GitHub

1. Créez un compte sur [github.com](https://github.com) si vous n'en avez pas
2. Créez un **nouveau dépôt public** nommé `anne-partridge`
3. Dans ce dossier, initialisez git et poussez le code :

```bash
cd /Users/oliverpartridge/python/anne-partridge
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/anne-partridge.git
git push -u origin main
```

---

## Étape 2 — Créer une application GitHub OAuth

C'est ce qui permet à Anne de se connecter au panneau d'administration.

1. Allez sur [github.com/settings/applications/new](https://github.com/settings/applications/new)
2. Remplissez :
   - **Application name** : `Anne Partridge CMS`
   - **Homepage URL** : `https://votre-domaine.vercel.app`
   - **Authorization callback URL** : `https://votre-domaine.vercel.app/api/auth`
3. Cliquez **Register application**
4. Notez le **Client ID** et générez un **Client Secret** — gardez-les précieusement

---

## Étape 3 — Déployer sur Vercel

1. Allez sur [vercel.com](https://vercel.com) et connectez-vous avec GitHub
2. Cliquez **Add New Project** → importez le dépôt `anne-partridge`
3. Dans les **Environment Variables** (Settings > Environment Variables), ajoutez :
   - `GITHUB_CLIENT_ID` = votre Client ID GitHub
   - `GITHUB_CLIENT_SECRET` = votre Client Secret GitHub
4. Notez l'URL de déploiement (ex: `anne-partridge.vercel.app`)

---

## Étape 4 — Mettre à jour la config CMS

Dans `admin/config.yml`, remplacez :

```yaml
repo: YOUR_GITHUB_USERNAME/anne-partridge   # ← votre nom d'utilisateur GitHub
base_url: https://YOUR_DOMAIN.vercel.app    # ← votre URL Vercel
```

Puis faites un `git commit` + `git push`.

---

## Étape 5 — Configurer le formulaire de contact

1. Créez un compte gratuit sur [formspree.io](https://formspree.io)
2. Créez un nouveau formulaire
3. Copiez l'ID du formulaire (ex: `xpzgkyvw`)
4. Dans `contact.html`, remplacez `YOUR_FORMSPREE_ID` par cet ID :

```html
<form ... action="https://formspree.io/f/xpzgkyvw" ...>
```

---

## Étape 6 — Domaine personnalisé (optionnel)

Dans Vercel (Settings > Domains), ajoutez `anne-partridge.com` et suivez les instructions DNS.

---

## Comment Anne édite son site

1. Elle va sur `https://votre-domaine.vercel.app/admin`
2. Elle clique **Login with GitHub** (elle doit avoir un compte GitHub)
3. Elle voit deux sections :
   - **📅 Prochaines Dates** → ajouter/modifier/supprimer des événements
   - **💬 Témoignages** → ajouter/modifier/supprimer des témoignages
4. Après avoir sauvegardé, le site se met à jour automatiquement en ~1 minute

> **Note** : Anne a besoin d'un compte GitHub et d'y être invitée comme collaboratrice du dépôt.
> Dans GitHub : Settings > Collaborators > Add people → entrez son nom d'utilisateur.

---

## Structure du projet

```
anne-partridge/
├── index.html                    ← Page d'accueil
├── qui-suis-je.html
├── tarifs.html
├── prochaines-dates.html         ← Chargé depuis content/prochaines-dates.json
├── temoignages.html              ← Chargé depuis content/temoignages.json
├── contact.html
├── parlerpourquelesenfants.html
├── freres-soeurs.html
├── atelier-enseignants.html
├── seances-individuelles.html
├── interventions.html
├── maieusthesie.html
├── bibliographie.html
├── conte-des-blipoux.html
├── english-workshop.html
├── formation.html
├── css/style.css                 ← Tous les styles
├── js/main.js                    ← Navigation + chargement JSON
├── partials/
│   ├── nav.html                  ← Navigation partagée
│   └── footer.html               ← Pied de page partagé
├── content/
│   ├── prochaines-dates.json     ← Éditable par Anne via /admin
│   └── temoignages.json          ← Éditable par Anne via /admin
├── admin/
│   ├── index.html                ← Panneau d'administration
│   └── config.yml                ← Configuration CMS
├── api/
│   └── auth.js                   ← Authentification GitHub OAuth
└── vercel.json                   ← Configuration Vercel
```
