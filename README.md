# CB Index PnL Attribution

Outil d'attribution de performance pour le FTSE Convertible Bond Index (fichiers quotidiens `AAAAMMJJ_UCBINDEXxxxx.xls`), en une seule page HTML sans serveur : ouvrir `index.html` dans un navigateur.

## Modes

- **Attribution journalière** : deux fichiers (T₀, T₁), un fichier annexe optionnel de l'index broad pour pricer les obligations sortantes les jours de rebalancement, saisie facultative de la performance réelle pour la réconciliation.
- **Récap mensuel** : tous les fichiers du mois (index principal + fichiers broad annexes). Chaînage géométrique des journées avec lissage de Carino, tableaux par secteur / région / émetteur, top-bottom, détail par obligation et par CB, exports Excel et CSV.

## Jambes d'attribution

Toutes les contributions sont en rendement (% du prix CB en T₀) pondéré par le poids T₀, affichées en bps.

| Jambe | Formule |
|---|---|
| Equity / Delta | (Delta/100) × Parité₀ × (ΔParité/Parité) / CB₀ (repli sur ΔEq/Eq si la parité manque) |
| Gamma | ½ × Gamma × Parité₀ × (ΔParité/Parité)² / CB₀ |
| Crédit | Rho(10bp) × ΔSpread/10 / CB₀ |
| Vega | Vega × ΔVol implicite / CB₀ |
| Taux | −Duration × Δr, ou Rho(10bp) × Δr/10 / CB₀ ; Δr (bp) par devise saisi ou déduit d'un tableau de niveaux collé depuis Excel |
| Carry | Coupon × jours calendaires / 365 / CB₀ |
| FX | Change devise → devise index, déduit par devise de la médiane des ratios ΔMarket Cap USD / ΔPrix |
| Résiduel | Rendement total − Σ jambes (theta, convexité, termes croisés) |

Le détail des conventions est dans la section « Méthodologie de calcul » en bas de la page.

## Tests

Tests fonctionnels en Chromium headless (Playwright) : génération de fichiers UCBINDEX synthétiques, vérification des formules de chaque jambe, de l'identité Σ jambes = rendement total, du chaînage Carino, des exports et de l'interface.

```
cd tests
npm install
npx playwright install chromium   # une seule fois
npm test
```
