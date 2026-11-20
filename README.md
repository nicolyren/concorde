# 🏛️ Concorde

Jeu de gestion **coopératif et positif**, en tour par tour (1 tour = 1 trimestre) : on dirige une commune, puis une région, puis un pays — **sans guerre ni concurrence**. Inspiré de Civilization et SimCity, 100 % dans le navigateur (TypeScript + Canvas, aucune dépendance d'exécution).

## Ce que vous gérez

- **Carte hexagonale procédurale** : plaines, forêts, collines, montagnes, eau ; plan d'urbanisme (zones résidentielle, économique, industrielle, agricole, naturelle).
- **Réseaux** : routes (un bâtiment non relié à la mairie est deux fois moins efficace), **autoroutes** (région+, ou référendum), **voies ferrées et gares** : deux gares reliées forment une ligne.
- **Économie & budget** : impôt sur le revenu, sur les entreprises, taxe foncière ; financement réglable des services ; dotations, billets de train, péages ; inflation et conjoncture.
- **Banques** : banque locale, banque coopérative, **banque centrale** (taux directeur, échelle nationale) ; emprunts, taux selon l'endettement et la stabilité bancaire.
- **Services** : écoles (primaire, collège-lycée, université), santé, sécurité & pompiers, culture, énergie (solaire, éolien, gaz, géothermie, nucléaire), environnement.
- **Institutions & démocratie** : conseil municipal → conseil régional → parlement ; 16 mesures/lois ; budget participatif ; **référendums** ; partis rivaux (non violents !), campagnes, sondages, **élections** par secteur (majoritaire à 2 tours ou proportionnelle, coalitions), cohabitation en cas de défaite.
- **Indice de bien-être** (9 indicateurs) et **bac à sable** : montez en échelle Commune → Région → Pays en tenant population et bien-être.
- **🎢 Mode Parc d'attraction** (depuis la page d'accueil) : un bac à sable séparé où l'on construit des attractions, de la restauration et des services pour attirer des visiteurs. Prix du billet d'entrée réglable, capacité des manèges et files d'attente, variété des sensations, réputation — sans élections ni progression de niveau.

## Lancer en local

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # moteur (carte, économie, élections) + parties automatiques
npm run build    # dist/ statique
```

## Déploiement

- **GitHub Pages** : le workflow `.github/workflows/deploy.yml` construit et publie à chaque push sur `main` (activer *Settings → Pages → Source : GitHub Actions*).
- **VPS** : copier le contenu de `dist/` dans le dossier servi par nginx/caddy (site 100 % statique, `base: './'`).

## Architecture

```
src/core/   moteur pur (sans DOM) : état, carte, simulation, élections, actions, contenu
src/ui/     rendu Canvas hexagonal et panneaux
tests/      tests Vitest + joueur automatique d'équilibrage
```

La sauvegarde est automatique (localStorage), avec plusieurs parties en parallèle : la page d'accueil liste toutes les parties commencées, et le bouton ⏸️ Pause permet d'y revenir sans perdre sa progression. Export/import JSON dans le menu ☰.
