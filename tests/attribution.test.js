// Tests fonctionnels de l'outil d'attribution (Chromium headless via Playwright).
// Les fichiers UCBINDEX synthétiques sont générés dans la page avec SheetJS, puis chargés
// dans les deux modes ; on vérifie les formules de chaque jambe et l'identité Σ jambes = rendement total.
//   cd tests && npm install && npm test
const path=require('path');const fs=require('fs');const assert=require('assert');
const {chromium}=require('playwright');
const near=(a,b,eps,msg)=>assert.ok(Math.abs(a-b)<eps,`${msg}: ${a} vs ${b}`);
// Localise un fichier de bibliothèque (node_modules local ou NODE_PATH) sans passer par les 'exports' des packages
const lib=rel=>{const dirs=[path.join(__dirname,'node_modules'),...(process.env.NODE_PATH||'').split(path.delimiter).filter(Boolean)];
  for(const d of dirs){const f=path.join(d,rel);if(fs.existsSync(f))return fs.readFileSync(f)}throw new Error('Bibliothèque introuvable : '+rel+' (npm install dans tests/)')};
(async()=>{
const browser=await chromium.launch();const page=await browser.newPage();const errors=[];
page.on('pageerror',e=>errors.push('PAGEERROR '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text())});
// Les CDN sont servis depuis node_modules pour tourner hors ligne
await page.route(/cdnjs\.cloudflare\.com/,r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('xlsx')?lib('xlsx/dist/xlsx.full.min.js'):lib('chart.js/dist/chart.umd.js')}));
await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.goto('file://'+path.resolve(__dirname,'../index.html'));
await page.waitForFunction(()=>window.XLSX&&window.Chart);

const H=['MACE ID','ISIN','Issue','Bond Currency','Convertible Price','Equity Price','Parity','Delta','Gamma','Rho (10bp)','Vega','Credit Spread','Implied Vol.','Index Weight','Market Cap (USDm)','Sector','Region','Country','Duration','Chi','Coupon','Maturity'];
const base=[
 {id:1001,isin:'US0001',issue:'ALPHA',ccy:'USD',cb:100,eq:50,par:90,delta:60,gamma:1.2,rho:-0.30,vega:0.25,spd:250,vol:32,w:40,mcap:1000,sector:'Tech',region:'US',country:'US',dur:3.5,cpn:1.5},
 {id:1002,isin:'FR0002',issue:'BETA',ccy:'EUR',cb:95,eq:20,par:70,delta:35,gamma:1.8,rho:-0.45,vega:0.30,spd:180,vol:28,w:35,mcap:800,sector:'Industrials',region:'Europe',country:'FR',dur:2.8,cpn:0},
 {id:1003,isin:'JP0003',issue:'GAMMA',ccy:'JPY',cb:110,eq:1200,par:105,delta:80,gamma:0.9,rho:-0.10,vega:0.15,spd:90,vol:35,w:25,mcap:600,sector:'Consumer',region:'Japan',country:'JP',dur:1.2,cpn:0}];
const withChanges=(chg)=>base.map(r=>({...r,...(chg[r.id]||{})}));
const mk=async(date,rows)=>{
  const buf=await page.evaluate(([H,rows])=>{
    const aoa=[['FTSE Convertible Bond Index'],['Global Focus (USD) Index'],[],H];
    rows.forEach(r=>aoa.push([r.id,r.isin,r.issue,r.ccy,r.cb,r.eq,r.par,r.delta,r.gamma,r.rho,r.vega,r.spd,r.vol,r.w,r.mcap*r.cb/100,r.sector,r.region,r.country,r.dur,0,r.cpn,new Date(Date.UTC(2029,5,15))]));
    const ws=XLSX.utils.aoa_to_sheet(aoa);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
    return Array.from(new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'})));},[H,rows]);
  return{name:date.replace(/-/g,'')+'_UCBINDEX0002.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(buf)};};

// T1 : ALPHA action +2 % / parité +2 %, spread +10bp ; BETA vol +1pt ; GAMMA prix seul
const f0=await mk('2026-08-31',base);
const f1=await mk('2026-09-01',withChanges({1001:{cb:101.2,eq:51,par:91.8,spd:260},1002:{cb:95.4,vol:29},1003:{cb:110.2}}));
const f2=await mk('2026-09-02',withChanges({1001:{cb:100.1,eq:51,par:91.8,spd:260},1002:{cb:95.0,vol:29},1003:{cb:110.5}}));

// ── Journalier
await page.setInputFiles('#inputT0',f0);await page.setInputFiles('#inputT1',f1);
await page.waitForFunction(()=>typeof dData!=='undefined'&&dData);
assert.strictEqual(await page.textContent('#errorD'),'','pas d\'erreur de parsing');
const byCcy=async()=>{const a=await page.evaluate(()=>dData.results);const o={};a.forEach(r=>o[r.bondCcy]=r);return o};
let r=await byCcy();
// Identité : Σ jambes + résiduel = rendement total (par obligation)
for(const x of Object.values(r))near(x.eqContrib+x.gammaContrib+x.creditContrib+x.vegaContrib+x.rateContrib+x.carryContrib+x.fxContrib+x.residual,x.totRetPct,1e-9,'identité '+x.bondCcy);
// Maturité normalisée en ISO (cellDates)
assert.strictEqual(r.USD.maturity,'2029-06-15','maturité ISO');
// Delta sur la parité : (60/100)×90×0.02 / 100 ×100 = 1.08 %
near(r.USD.eqContrib,0.6*90*0.02/100*100,1e-9,'delta');
near(r.USD.parityRetPct,2,1e-9,'parité %');
// Gamma : ½ × 1.2 × 90 × 0.02² / 100 × 100 = 0.0216 %
near(r.USD.gammaContrib,0.5*1.2*90*0.0004/100*100,1e-9,'gamma');
// Crédit : −0.30 × (10/10) / 100 × 100 = −0.30 %
near(r.USD.creditContrib,-0.30/100*100,1e-9,'crédit');
// Vega : 0.30 × 1 / 95 × 100
near(r.EUR.vegaContrib,0.30/95*100,1e-9,'vega');
// Carry : coupon 1.5 × 1 jour / 365 / 100 × 100 ; 0 pour les zéro-coupon
near(r.USD.carryContrib,1.5*1/365/100*100,1e-12,'carry USD');near(r.EUR.carryContrib,0,1e-12,'carry EUR');
assert.strictEqual(r.USD.days,1,'jours');
// Sans données taux → 0
near(r.USD.rateContrib,0,1e-12,'taux vide');
// Tableau de niveaux : USD −8bp, EUR +5bp, JPY absent
await page.evaluate(()=>{document.getElementById('ratesBoxD').open=true;document.getElementById('ratesBoxM').open=true});
// Tableau clairsemé (début/fin) : interpolation linéaire → 08-31→09-01 reçoit la moitié de 08-31→09-02 ; format CSV virgule
await page.fill('#rateLevelsD','Date,USD,EUR\n2026-08-31,4.18,3.20\n2026-09-02,4.80,3.60');
r=await byCcy();near(r.USD.rateChange,31,1e-9,'interpolation USD');near(r.EUR.rateChange,20,1e-9,'interpolation EUR');
// Tableau ne couvrant pas T1 : niveau plat au-delà, et avertissement
await page.fill('#rateLevelsD','Date\tUSD\n2026-08-20\t4.18\n2026-08-31\t4.80');
r=await byCcy();near(r.USD.rateChange,0,1e-9,'plat hors tableau');assert.ok((await page.textContent('#rateStatusD')).includes('hors tableau'),'avertissement hors tableau');
await page.fill('#rateLevelsD','Date\tUSD\tEUR\n2026-08-31\t3.62\t2.31\n2026-09-01\t3.54\t2.36\n2026-09-02\t3.60\t2.30');
r=await byCcy();
near(r.USD.rateContrib,-3.5*-8/100,1e-9,'taux duration USD');near(r.EUR.rateContrib,-2.8*5/100,1e-9,'taux duration EUR');near(r.JPY.rateContrib,0,1e-12,'taux JPY absent');
assert.ok((await page.textContent('#rateStatusD')).includes('sans donnée : JPY'),'statut devises manquantes');
// Saisie manuelle JPY +3bp
await page.fill('#rateCcyRowD input[data-ccy="JPY"]','3');await page.press('#rateCcyRowD input[data-ccy="JPY"]','Enter');
r=await byCcy();near(r.JPY.rateContrib,-1.2*3/100,1e-9,'taux JPY manuel');
// Sensibilité Rho
await page.selectOption('#rateSensD','rho');r=await byCcy();
near(r.USD.rateContrib,(-0.30*-8/10)/100*100,1e-9,'taux rho USD');near(r.EUR.rateContrib,(-0.45*5/10)/95*100,1e-9,'taux rho EUR');
assert.strictEqual(await page.inputValue('#rateSensM'),'rho','sélecteur synchronisé');
await page.selectOption('#rateSensD','duration');
// Totaux pondérés = Σ poids × contribution
const tot=await page.evaluate(()=>sumResults(dData.results));
r=await byCcy();near(tot.wtdRate,0.4*r.USD.rateContrib+0.35*r.EUR.rateContrib+0.25*r.JPY.rateContrib,1e-9,'wtdRate');
near(tot.wtdTotal,tot.wtdEquity+tot.wtdGamma+tot.wtdCredit+tot.wtdVega+tot.wtdRate+tot.wtdCarry+tot.wtdFX+tot.wtdResidual,1e-9,'identité totaux');
// Cartes et onglets
for(const lab of['Taux','Carry','Résiduel'])assert.ok((await page.textContent('#dCardsRow')).includes(lab),'carte '+lab);
for(const t of['sector','region','issuer','top','detail']){await page.click(`#dTabs .tab[data-tab="${t}"]`);const h=await page.textContent('#dTabContent thead');assert.ok(/Taux|Wtd Tx/.test(h)&&/Carry|Wtd Cy/.test(h),'colonnes '+t)}
// Export Excel journalier (intercepté)
const xl=await page.evaluate(()=>{const out={};const o=XLSX.writeFile;XLSX.writeFile=wb=>{wb.SheetNames.forEach(n=>out[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1}))};document.getElementById('dExportXL').click();XLSX.writeFile=o;return out});
assert.deepStrictEqual(Object.keys(xl),['Résumé','Par Secteur','Par Région','Par Émetteur','Détail Obligations','Taux'],'feuilles export journalier');
assert.ok(xl['Détail Obligations'][0].includes('Parité%')&&xl['Détail Obligations'][0].includes('Wtd Carry(bps)'),'colonnes détail');
// Avertissement dates : T1 antérieur à T0
await page.setInputFiles('#inputT1',f0);await page.setInputFiles('#inputT0',f1);
await page.waitForFunction(()=>dDates.t0==='2026-09-01'&&dDates.t1==='2026-08-31');
assert.ok((await page.textContent('#dDateWarn')).includes('postérieur'),'avertissement ordre des dates');
await page.setInputFiles('#inputT0',f0);await page.setInputFiles('#inputT1',f1);
await page.waitForFunction(()=>dDates.t0==='2026-08-31'&&dDates.t1==='2026-09-01');
assert.ok(await page.evaluate(()=>document.getElementById('dDateWarn').classList.contains('hidden')),'pas d\'avertissement si dates OK');

// ── Mensuel
await page.click('.mode-btn[data-mode="monthly"]');
await page.setInputFiles('#multiInput',[f0,f1,f2]);
await page.waitForFunction(()=>typeof mCumData!=='undefined'&&mCumData);
const m=await page.evaluate(()=>({daily:mDailyAttr.map(d=>({date:d.date,rm:d.rateMoves,cov:d.rateCov,carino:d.carino,...LEGS.reduce((o,k)=>(o[k]=d[k],o),{})})),t:monthlyTotals(mDailyAttr),bonds:mCumData.bonds}));
assert.strictEqual(m.daily.length,2,'2 jours');
near(m.daily[1].rm.USD,6,1e-9,'Δ taux jour 2 USD');near(m.daily[0].cov,75,1e-9,'couverture 75 %');
assert.ok((await page.textContent('#rateStatusM')).includes('Δ sur la période 2026-08-31 → 2026-09-02 : EUR -1.0bp, USD -2.0bp'),'statut Δ période : '+await page.textContent('#rateStatusM'));
// Tableau à deux lignes (type swap 5 ans début/fin de mois) : Σ Δ quotidiens = Δ période, réparti uniformément
await page.fill('#rateLevelsM','Date,USD,EUR,JPY\n2026-08-31,4.18,3.20,2.29\n2026-09-02,4.80,3.60,2.45');
await page.waitForFunction(()=>mDailyAttr[0].rateMoves.JPY!=null);
const sparse=await page.evaluate(()=>mDailyAttr.map(d=>d.rateMoves));
for(const c of['USD','EUR','JPY']){const tot=sparse.reduce((a,d)=>a+d[c],0);near(tot,{USD:62,EUR:40,JPY:16}[c],1e-9,'Δ période '+c);near(sparse[0][c],sparse[1][c],1e-9,'répartition uniforme '+c)}
const mt=await page.evaluate(()=>monthlyTotals(mDailyAttr));assert.ok(Math.abs(mt.wtdRate)>0.05,'contribution taux non nulle avec tableau clairsemé : '+mt.wtdRate);
await page.fill('#rateLevelsM','Date\tUSD\tEUR\n2026-08-31\t3.62\t2.31\n2026-09-01\t3.54\t2.36\n2026-09-02\t3.60\t2.30');
await page.waitForFunction(()=>mDailyAttr[0].rateMoves.JPY==null);
// Carino : Σ k_j r_j = Π(1+r_j) − 1, et chaque jambe somme au total
const R=m.daily.reduce((p,d)=>p*(1+d.wtdTotal/100),1)-1;
near(m.t.wtdTotal,R*100,1e-9,'total composé');
near(m.t.wtdTotal,m.t.wtdEquity+m.t.wtdGamma+m.t.wtdCredit+m.t.wtdVega+m.t.wtdRate+m.t.wtdCarry+m.t.wtdFX+m.t.wtdResidual,1e-9,'identité mensuelle');
near(m.bonds.reduce((a,b)=>a+b.wtdTotal,0),m.t.wtdTotal,1e-9,'Σ obligations = total');
// Détail par CB : bps cohérents (×100, plus ×10000)
await page.click('#mTabs .tab[data-tab="cbdetail"]');
const sel=await page.evaluate(()=>{const s=document.getElementById('cbSelector');return{opt:s.options[s.selectedIndex].textContent,id:s.value}});
const b=m.bonds.find(x=>x.maceId===sel.id);const expBps=(b.wtdTotal>=0?'+':'')+(b.wtdTotal*100).toFixed(2);
assert.ok(sel.opt.includes('['+expBps+' bps]'),'bps sélecteur : '+sel.opt+' attendu '+expBps);
assert.ok((await page.textContent('.cb-info-bar')).includes(expBps+' bps'),'bps barre info');
assert.ok((await page.textContent('#cbDailyTable thead')).includes('ΔTx(bp)'),'colonne ΔTx');
// Ligne Σ Cumulé (Carino) = Σ Wtd Total de la barre d'info
const lastRow=await page.evaluate(()=>{const tr=[...document.querySelectorAll('#cbDailyTable tbody tr')].pop();return[...tr.children].map(td=>td.textContent)});
assert.ok(lastRow[0].startsWith('Σ Cumulé')&&lastRow.includes(expBps),'Σ Cumulé Carino = total CB ('+lastRow.join('|')+')');
// Export mensuel
const xm=await page.evaluate(()=>{const out={};const o=XLSX.writeFile;XLSX.writeFile=wb=>{wb.SheetNames.forEach(n=>out[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1}))};document.getElementById('mExportXL').click();XLSX.writeFile=o;return out});
assert.deepStrictEqual(Object.keys(xm),['Résumé','Jour par Jour','Taux','Par Secteur','Par Région','Par Émetteur','Détail Obligations'],'feuilles export mensuel');
near(xm['Jour par Jour'][1][1],m.daily[0].wtdTotal*100,1e-9,'export jour 1 total bps');
// Persistance
await page.reload();await page.waitForFunction(()=>window.XLSX&&window.Chart);
assert.ok((await page.inputValue('#rateLevelsM')).includes('2026-09-01'),'niveaux persistés');
assert.deepStrictEqual(errors,[],'aucune erreur JS');
await browser.close();console.log('✓ tous les tests passent');
})().catch(e=>{console.error('✗ '+e.message);process.exit(1)});
