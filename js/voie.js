// ================================================================
// VOIE.JS : Page "Diagonale de la Puissance" (#page-voie), ELO, rangs, jalons
// ================================================================
// LA « VOIE DES VICTOIRES » S'APPELLE MAINTENANT LA DIAGONALE DE LA
// PUISSANCE. Il y a désormais trois voies de progression, et chacune porte le
// nom d'une ligne de l'échiquier : la DIAGONALE (ici, l'ELO, qui monte en
// zigzag), la COLONNE des victoires et la RANGÉE de la richesse (les deux
// dans js/rewards.js). Les identifiants restent en `voie-` / `page-voie` /
// `vv*` : ce sont les clés sur lesquelles sont accrochés le CSS, le tutoriel,
// les sauvegardes de compte et le test de fumée — les renommer ne changerait
// rien à l'écran (même raisonnement que 'chevaucheur-rhinoceros' dans
// js/data-pieces.js).
//
// Contient : le calcul d'ELO après une partie (vvCalcNewElo — formule Elo,
// K-facteur dégressif, courbe d'ascension étalée de 0 à 2000 ELO et garde-fou
// d'amplitude, voir le pavé « LA COURBE D'ASCENSION » plus bas ; c'est le
// réglage principal du jeu), sa mise en phrase pour le joueur (vvEloExplain),
// le
// compteur de parties classées (vvRankedGames / vvRankedWins),
// la détection de nouveaux déblocages
// (vvCheckNewUnlocks), l'estimation de l'ELO d'un instructeur IA
// (vvEstimateAiElo), et le rendu de la page Voie (bannière de rang + file des
// jalons de déblocage — et RIEN d'autre : aucune statistique, aucun
// historique, voir renderVoiePage).
//
// Dépendances : data-pieces.js (RANKS, UNLOCK_MILESTONES, PIECES,
// CLASS_COLOR_VARS, vvGetRank, vvGetRankIdx, vvGetRankFloor),
// accounts.js (vvLoadElo, vvSaveUnlocked), main.js
// (VV_UNLOCKED, ADMIN_MODE, showPage), armies.js (renderArmiesPage,
// pour le retour vers "Mes armées").
// Utilisé par : game-flow.js (triggerEndOfGame appelle vvCalcNewElo/
// vvCheckNewUnlocks), menu principal (bouton "Voie").
// ================================================================

// ----------------------------------------------------------------
// CALCULS ELO
// ----------------------------------------------------------------
// ELO attribué à l'adversaire pour le calcul du gain/perte : celui de
// l'adversaire du laboratoire en cours, ou celui transmis par l'adversaire
// réel en ligne via cette surcharge.
let _opponentEloOverride=null;
function vvSetOpponentElo(v){_opponentEloOverride=(typeof v==='number'&&v>0)?v:null;}
function vvEstimateAiElo(){
  if(typeof _opponentEloOverride==='number')return _opponentEloOverride;
  // Chaque adversaire porte son propre ELO (AI_OPPONENTS dans
  // js/data-pieces.js) : c'est lui, et non une valeur unique, qui décide de ce
  // que vaut la victoire.
  const o=(typeof aiCurrentOpponent==='function')?aiCurrentOpponent():INSTRUCTOR;
  return(o&&o.elo)||800;
}
// ----------------------------------------------------------------
// LA COURBE D'ASCENSION : une pente régulière de 0 à 2000, sans marche
// ----------------------------------------------------------------
// Epic Chess n'est pas un tournoi, c'est une AVENTURE. Un compte neuf part
// de 0 et doit pouvoir traverser TOUTE la Voie — les sept rangs, de Bois à
// Or Légendaire — sans être un joueur d'échecs. Un Elo pur ne fait pas ça :
// il place tout le monde autour de sa vraie force et l'y laisse à vie.
//
// LA VERSION PRÉCÉDENTE VISAIT 1000 ELO, ET ELLE Y ARRIVAIT TROP BIEN. Le
// K de placement valait 60 et la majoration des gains ×3 : la toute première
// victoire rapportait +127, et une victoire de routine à bas classement +48.
// Simulé à 50 % de victoires, cela donnait Pierre en 4 parties, Bronze en 17,
// Acier en 37, et 1000 ELO en 77. Tout le catalogue de créatures jusqu'à
// l'Empereur tombait en une soirée.
//
// Et juste derrière, un MUR : passé 1000 les bonus s'éteignaient d'un coup et
// l'Elo redevenait pur, c'est-à-dire immobile à 50 % de victoires. La même
// simulation demandait alors 1316 parties pour aller de 1000 à 1500, et à
// 45 % de victoires 1500 n'arrivait JAMAIS. La courbe était binaire : tout
// donné en quarante parties, puis plus rien. C'est le pire profil possible —
// le joueur consomme le jeu d'un trait, puis se cogne.
//
// LE RÉGLAGE ACTUEL ÉTALE LA MÊME PROMESSE SUR TOUTE LA VOIE. L'assistance ne
// s'arrête plus à 1000 mais s'éteint progressivement jusqu'à 2000, et les
// K-facteurs ont été divisés par deux environ. Trois mécanismes, tous dans
// vvCalcNewElo :
//
//   1. K DÉGRESSIF. Le K-facteur mesure combien une partie déplace le
//      classement : 30 pour les cinq parties de placement, puis 22, 18, et 14
//      en régime de croisière, puis une descente en pente douce jusqu'à 10 à
//      partir de 1700 ELO, où un classement doit être stable sinon il ne veut
//      plus rien dire. Voir VV_K_STEPS et vvKFactor.
//
//   2. LA COURBE D'ASCENSION. Sous VV_CLIMB_TOP, les gains sont majorés et
//      les pertes amorties, d'autant plus fortement qu'on est bas. À 0 ELO on
//      gagne 1,9 fois ce que dit la formule et on ne perd que 30 % ; à 2000
//      les deux multiplicateurs valent 1 et l'Elo redevient l'Elo, sans
//      marche d'escalier puisqu'ils se rejoignent progressivement.
//      La décroissance est LINÉAIRE (VV_CLIMB_EASE=1). L'ancien exposant 0,6
//      servait à empêcher le bonus de s'évaporer dès 300 ELO — mais c'était
//      avec un seuil à 1000. Étalé sur 2000, le linéaire tient tout seul :
//      la majoration vaut encore ×1,45 à 1000 ELO et ×1,22 à 1500.
//
//   3. LE RANG EST ACQUIS, L'ELO EST VIVANT. Deux nombres, deux rôles :
//      · `elo` monte ET DESCEND. Une défaite coûte TOUJOURS au moins un
//        point, à n'importe quel niveau (seul le zéro absolu l'arrête : un
//        classement négatif n'a pas de sens).
//      · `elo_peak` — le plus haut ELO jamais atteint — ne descend JAMAIS.
//        C'est lui, et lui seul, qui décide du rang affiché et de tout ce qui
//        se débloque : créatures, échiquiers, jalons. Un joueur Bronze reste
//        donc Bronze pour toujours, exactement comme une arène de Clash
//        Royale, et il ne reperd jamais une créature.
//
//      LA VERSION PRÉCÉDENTE PLAÇAIT LE PLANCHER SUR L'ELO LUI-MÊME, au
//      minimum du rang courant. Elle tenait la promesse « on ne descend pas
//      d'arène », mais au prix d'un défaut grave : un joueur assis
//      exactement sur un plancher (500, 800, 1200…) ne perdait plus RIEN en
//      cas de défaite. C'était un point de stationnement à risque zéro, avec
//      des tentatives illimitées pour remonter — la pire chose qu'on puisse
//      mettre dans un classement. Séparer les deux nombres tient la même
//      promesse sans jamais rendre une défaite gratuite. NE PAS Y REVENIR.
//
// Ces trois règles se lisent aussi côté joueur, sur le modal de fin de partie
// (vvEloExplain, plus bas) : sans explication, un « +17 / -3 » ressemble à un
// bug plutôt qu'à un cadeau.

// Seuil de fin d'ascension : au-dessus, plus aucun bonus, l'Elo est pur.
// C'est le début d'Or Légendaire, le dernier rang — l'assistance couvre donc
// exactement la Voie, et pas un point de plus.
const VV_CLIMB_TOP=2000;
// Majoration maximale des gains et amortissement maximal des pertes, tous
// deux atteints à 0 ELO : au départ une victoire vaut presque double et une
// défaite ne coûte que 30 % de ce que dit la formule.
const VV_CLIMB_GAIN_MAX=1.9;
const VV_CLIMB_LOSS_MIN=0.30;
// Forme de la décroissance (voir le point 2 ci-dessus) : 1 = linéaire.
const VV_CLIMB_EASE=1.0;
// Au-delà de ce classement, l'assistance existe encore mais elle est trop
// discrète pour mériter une phrase (×1,3 et moins). vvEloExplain se tait :
// une note de bas de page à chaque partie n'explique plus rien, elle devient
// du décor. Voir vvEloExplain.
const VV_CLIMB_NOTE_TOP=1200;

// AMPLITUDE MAXIMALE D'UNE PARTIE, majoration comprise. C'est le garde-fou
// qui répond directement au défaut d'origine : quoi qu'il arrive, aucune
// partie ne déplace le classement de plus de 30 points. Le plafond ne mord
// que sur les vrais exploits — battre un adversaire plusieurs centaines de
// points au-dessus de soi pendant les parties de placement — et laisse
// intacte la lecture ordinaire, où une victoire vaut de +11 à +17.
const VV_MAX_SWING=30;

// K-facteur par nombre de parties CLASSÉES déjà jouées. Les cinq premières
// sont des parties de placement : elles pèsent un peu plus de deux fois une
// partie de routine, de quoi sortir un joueur fort du bas de l'échelle sans
// pour autant lui offrir un rang par soirée.
const VV_K_STEPS=[
  {games:5,  k:30},   // placement
  {games:20, k:22},
  {games:60, k:18},
];
const VV_K_BASE=14;     // régime de croisière
const VV_K_ELITE=10;    // à partir de VV_ELITE_ELO : un classement stable
// LE RESSERREMENT DU HAUT DE TABLEAU SE FAIT EN PENTE, PAS EN MARCHE. Le K
// passait de VV_K_BASE à VV_K_ELITE d'un seul coup au franchissement du
// seuil : comme la courbe d'ascension s'éteint au même endroit, un joueur qui
// venait tout juste d'atteindre Or Légendaire voyait ses gains passer de +10
// à +5 du jour au lendemain — une punition à l'instant précis du sacre. Le K
// glisse donc linéairement de l'un à l'autre entre VV_ELITE_START et
// VV_ELITE_ELO, ce qui rend la transition continue.
const VV_ELITE_START=1700;
const VV_ELITE_ELO=2000;

// CE QUE CE RÉGLAGE DONNE, PAR SIMULATION (60 tirages par point, adversaires
// tirés à ±200 ELO autour du classement courant, taux de victoires fixé).
// Médiane du nombre de parties nécessaires pour atteindre chaque rang :
//
//   victoires │  Pierre Bronze  Acier  (mi-Voie) Obsid.  Argent   Or
//             │    200    500    800     1000     1200    1500   2000
//   ──────────┼──────────────────────────────────────────────────────
//      60 %   │     15     49    104      152      200     289    532
//      50 %   │     18     74    153      211      290     436   1219
//      45 %   │     22     89    193      268      360     603   7693
//      35 %   │     34    154    342      528      916       —      —
//
// Et les jalons de la Voie eux-mêmes, à 50 % de victoires : 6 perles dès la
// première partie, le Preux Chevalier en 4, la Méduse en 21, l'Empereur en
// 66, le Prêtre en 153, le Typhon en 211, la Banshee en 268, le Grand Maître
// en 591.
//
// Ce qu'il faut y lire, et qui EST la promesse :
//   · Les premiers jalons tombent tout de suite : le joueur repart de sa
//     toute première partie avec quelque chose en main. C'est l'hameçon, et
//     il n'a pas besoin d'être payé en centaines de points d'ELO.
//   · Chaque rang coûte ensuite nettement plus cher que le précédent — de 18
//     parties à 74, puis 153, puis 290 — sans qu'aucune porte ne se ferme
//     d'un coup. C'est une pente, jamais une marche.
//   · Même en perdant DEUX PARTIES SUR TROIS, on atteint Obsidienne : cinq
//     rangs sur sept, le Typhon, la Banshee, l'échiquier d'Acier. Il n'y a
//     pas de mur, seule la durée change.
//   · Les deux derniers rangs (Argent, Or Légendaire) ne sont pas donnés :
//     c'est la fin de l'aventure, et elle se mérite en jouant mieux, pas
//     seulement en jouant plus.
//
// CES NOMBRES SONT LE RÉGLAGE PRINCIPAL DU JEU. Toucher à VV_CLIMB_*, à
// VV_K_* ou à VV_MAX_SWING déplace ce tableau : refaire la simulation avant,
// et le recopier ici.

// Parties et victoires CLASSÉES de ce compte, depuis toujours. Comptées à
// part de l'historique (vvLoadHistory), qui ne garde que les 30 dernières
// parties, et à part de la colonne des victoires (col_wins, js/rewards.js),
// qui plafonne à ses 30 paliers : ni l'une ni l'autre ne sait dire combien de
// parties un compte a réellement jouées. La page Comptes affiche ces deux
// chiffres, et vvCalcNewElo lit le premier pour choisir son K-facteur.
function vvRankedGames(){return accGet('ranked_games',0);}
function vvRankedWins(){return accGet('ranked_wins',0);}
function vvNoteRankedGame(result){
  if(vvAdmin())return;
  accSet('ranked_games',vvRankedGames()+1);
  if(result==='win')accSet('ranked_wins',vvRankedWins()+1);
}

function vvKFactor(playerElo,games){
  if(playerElo>=VV_ELITE_ELO)return VV_K_ELITE;
  // Les parties de placement gardent leur K quel que soit le classement :
  // un compte neuf n'arrive pas à 1700 ELO, et s'il y arrivait par import,
  // c'est justement le placement qu'on veut voir agir.
  for(const s of VV_K_STEPS)if(games<s.games)return s.k;
  if(playerElo>VV_ELITE_START){
    const t=(playerElo-VV_ELITE_START)/(VV_ELITE_ELO-VV_ELITE_START);
    return VV_K_BASE+(VV_K_ELITE-VV_K_BASE)*t;
  }
  return VV_K_BASE;
}

// Multiplicateurs d'ascension à un ELO donné. t vaut 1 au départ (0 ELO) et
// 0 une fois VV_CLIMB_TOP atteint.
function vvClimbFactors(elo){
  const lin=Math.max(0,Math.min(1,(VV_CLIMB_TOP-elo)/VV_CLIMB_TOP));
  const t=Math.pow(lin,VV_CLIMB_EASE);
  return{
    gain:1+(VV_CLIMB_GAIN_MAX-1)*t,
    loss:1-(1-VV_CLIMB_LOSS_MIN)*t,
    climbing:t>0,
    // L'assistance mérite-t-elle encore d'être dite au joueur ? Voir
    // VV_CLIMB_NOTE_TOP : au-delà elle agit toujours, mais si discrètement
    // qu'une phrase à chaque fin de partie deviendrait du décor.
    notable:elo<VV_CLIMB_NOTE_TOP,
  };
}

// Calcul complet. Renvoie le nouvel ELO, l'écart réellement appliqué, et de
// quoi l'expliquer au joueur (k, multiplicateurs, plancher touché ou non).
function vvCalcNewElo(playerElo,aiElo,result,games){
  const g=(typeof games==='number')?games:vvRankedGames();
  const K=vvKFactor(playerElo,g);
  const E=1/(1+Math.pow(10,(aiElo-playerElo)/400));
  const S=result==='win'?1:result==='loss'?0:0.5;
  const raw=K*(S-E);
  const cf=vvClimbFactors(playerElo);

  // La courbe d'ascension s'applique au SENS du résultat, pas au signe du
  // calcul brut : une victoire contre bien plus faible que soi donne un raw
  // minuscule mais positif, elle doit être majorée comme une victoire.
  //
  // UNE VICTOIRE RAPPORTE TOUJOURS AU MOINS 1 POINT, UNE DÉFAITE EN COÛTE
  // TOUJOURS AU MOINS 1. Sans ces deux bornes, l'arrondi produit des « +0 »
  // et des « -0 » : gagner sans rien gagner décourage, et perdre sans rien
  // perdre transforme le classement en distributeur à essais gratuits.
  let delta;
  if(result==='win')delta=Math.max(1,Math.round(raw*cf.gain));
  else if(result==='loss')delta=Math.min(-1,Math.round(raw*cf.loss));
  else delta=Math.round(raw*(raw>=0?cf.gain:cf.loss));

  // GARDE-FOU D'AMPLITUDE. Aucune partie, quelle qu'elle soit, ne déplace le
  // classement de plus de VV_MAX_SWING points. Il était auparavant déduit du
  // K le plus élevé (60 × 3 = 180), c'est-à-dire assez haut pour ne jamais
  // rien garder : c'est lui, désormais, qui tient la promesse « une partie
  // reste une partie ».
  delta=Math.max(-VV_MAX_SWING,Math.min(VV_MAX_SWING,delta));

  // Seul plancher : le zéro absolu. Le rang, lui, ne se perd pas — il est
  // porté par elo_peak (voir le point 3 de l'en-tête), pas par ce nombre.
  const rawNew=playerElo+delta;
  const newElo=Math.max(0,rawNew);
  return{
    newElo,
    delta:newElo-playerElo,
    k:K,
    games:g,
    climbing:cf.climbing,
    notable:cf.notable,
    gainMult:cf.gain,
    lossMult:cf.loss,
    bottomed:rawNew<0,          // le zéro absolu a absorbé la perte
  };
}

// Phrase affichée sous l'écart d'ELO à la fin d'une partie. Elle ne se montre
// que quand il s'est passé quelque chose que le chiffre seul n'explique pas :
// une partie de placement, le bonus d'ascension, ou une défaite qui fait
// descendre l'ELO sous un rang déjà acquis — le seul moment où le joueur
// pourrait croire qu'il vient de perdre ses créatures. En régime ordinaire
// elle reste vide.
function vvEloExplain(calc,result,peakElo){
  if(!calc)return '';
  // DESCENDRE SOUS SON RANG. L'ELO peut retomber sous le seuil du rang
  // atteint : c'est le moment où il faut dire, tout de suite, que le rang et
  // ce qu'il a débloqué sont acquis. Sinon le joueur croit avoir tout perdu.
  if(result==='loss'&&typeof peakElo==='number'&&typeof vvGetRank==='function'){
    const rangAcquis=vvGetRank(peakElo);
    if(calc.newElo<rangAcquis.min)
      return 'Rang '+rangAcquis.name+' acquis : vos créatures et vos échiquiers restent à vous.';
  }
  if(result==='loss'&&calc.bottomed)
    return 'Vous êtes au bas de l\'échelle : impossible de descendre plus bas.';
  // LES PARTIES DE PLACEMENT NE S'ANNONCENT PLUS. « Partie de placement 2/5 :
  // elle compte double » expliquait un écart d'ELO par une règle de plus à
  // retenir, à un moment — les cinq premières parties — où le joueur découvre
  // déjà tout le reste. L'écart, lui, se lit sur la ligne au-dessus, et il est
  // dans le bon sens : c'est une bonne nouvelle qui n'a pas besoin de note de
  // bas de page.
  // L'ASSISTANCE NE S'ANNONCE QUE TANT QU'ELLE SE VOIT. Elle court maintenant
  // jusqu'à 2000 ELO (contre 1000 auparavant) : la dire à chaque partie
  // reviendrait à coller la même note de bas de page sous les trois quarts
  // des résultats du jeu, ce qui ne l'explique plus, ce qui la banalise. Elle
  // se tait donc au-delà de VV_CLIMB_NOTE_TOP, là où le multiplicateur est
  // devenu trop faible pour surprendre qui que ce soit.
  if(calc.notable&&result==='win')
    return 'Bonus d\'ascension : ×'+calc.gainMult.toFixed(1)+' jusqu\'à '+VV_CLIMB_TOP+' ELO.';
  if(calc.notable&&result==='loss')
    return 'Ascension : la défaite ne coûte que '+Math.round(calc.lossMult*100)+' % avant '+VV_CLIMB_TOP+' ELO.';
  return '';
}

// Une partie est-elle CLASSÉE, c'est-à-dire fait-elle bouger l'ELO ?
// Renvoie null si oui, sinon la raison (affichée dans le modal de résultat).
//
// AVANT, seul le jeu en ligne comptait : affronter l'IA était
// « un entraînement ». C'était défendable avec un adversaire unique à pleine
// puissance, mais cela fermait tout le jeu à qui joue seul. Le classement
// n'avançait pas d'un point, donc aucune pièce à palier d'ELO (Preux
// Chevalier à 50, Méduse à 210, Typhon à 1000, Grand Maître à 1700) et aucun
// échiquier n'était atteignable sans trouver un adversaire humain.
//
// Il y a maintenant douze adversaires d'ELO connu et espacé (AI_OPPONENTS) :
// une victoire contre l'un d'eux mesure exactement ce que mesure une victoire
// contre un humain de même niveau. Ces parties sont donc CLASSÉES, et le
// classement se régule tout seul : battre un adversaire très au-dessous de
// son propre niveau ne rapporte quasiment rien (formule Elo), donc aucun des
// paliers qui débloquent pièces et échiquiers.
//
// Restent non classées : les parties du mode test (une démonstration ne doit
// pas polluer la progression réelle) et les batailles du tutoriel, qui ne
// passent de toute façon pas par ici (voir triggerEndOfGame).
// VV_NO_ELO_TRAINING est conservée pour les sauvegardes et le modal de fin.
const VV_NO_ELO_TRAINING='Entraînement : aucun ELO en jeu.';
function vvNoEloReason(gs){
  if(typeof ADMIN_MODE!=='undefined'&&ADMIN_MODE)return 'Mode test : partie non classée, aucun ELO en jeu.';
  if(gs&&gs.tuto)return VV_NO_ELO_TRAINING;
  return null;
}
function vvCheckNewUnlocks(oldElo,newElo){
  const newUnlocks=[];
  UNLOCK_MILESTONES.forEach(u=>{
    if(!u.pieceId)return;if(u.coffre)return;
    if(u.eloRequired>oldElo&&u.eloRequired<=newElo&&!VV_UNLOCKED.has(u.pieceId)){VV_UNLOCKED.add(u.pieceId);newUnlocks.push(u.pieceId);}
  });
  if(newUnlocks.length)vvSaveUnlocked(VV_UNLOCKED);return newUnlocks;
}

// Petits jalons de récompense (perles / exemplaires) semés entre les jalons
// de déblocage, voir UNLOCK_TABLE (js/data-pieces.js). Versés une seule fois
// chacun (accGet/accSet 'voie_rewards_claimed', par id de jalon) : sans ce
// suivi, un ELO qui redescend puis remonte au-dessus d'un palier déjà
// franchi verserait la récompense une seconde fois.
function vvCheckRewardMilestones(oldElo,newElo){
  const claimed=new Set(accGet('voie_rewards_claimed',[]));
  const granted=[];
  UNLOCK_MILESTONES.forEach(u=>{
    if(!u.reward||claimed.has(u.id))return;
    if(!(u.eloRequired>oldElo&&u.eloRequired<=newElo))return;
    if(u.reward==='pearls'&&typeof pearlAdd==='function')pearlAdd(u.amount);
    else if(u.reward==='copies'&&typeof invAdd==='function')invAdd(u.copyId,u.qty);
    claimed.add(u.id);granted.push(u);
  });
  if(granted.length)accSet('voie_rewards_claimed',[...claimed]);
  return granted;
}

// ----------------------------------------------------------------
// RENDU DE LA PAGE VOIE
// ----------------------------------------------------------------
// La Voie affiche la progression telle qu'elle est. En mode test (/?test),
// elle se lit donc terminée — c'est exact : là-dedans, l'ELO vaut 10 000 et
// tout le catalogue est débloqué (voir js/accounts.js et js/economy.js).
// Rien n'en est écrit sur le compte, on retrouve sa vraie Voie en revenant.
function renderVoiePage(){
  // DEUX NOMBRES, DEUX RÔLES (voir le pavé « LA COURBE D'ASCENSION » plus
  // haut) : `elo` est le classement du moment, `peak` le sommet atteint. Le
  // RANG et le rang suivant se lisent sur le sommet — ils sont acquis. La
  // JAUGE, elle, part du classement du moment : c'est de là qu'il faut
  // réellement grimper, et une jauge qui ne redescendrait jamais mentirait
  // sur la distance restante.
  const elo=vvLoadElo();
  const peak=(typeof vvLoadPeakElo==='function')?vvLoadPeakElo():elo;
  const rank=vvGetRank(peak);
  const nextRank=RANKS[vvGetRankIdx(peak)+1]||null;
  const progress=nextRank
    ?Math.max(0,Math.min(100,Math.round((elo-rank.min)/(nextRank.min-rank.min)*100)))
    :100;
  // Le classement est-il retombé sous le rang acquis ? C'est le seul cas où
  // la bannière doit dire quelque chose de plus : sans phrase, un joueur
  // Bronze qui lit « 430 ELO » croit avoir été rétrogradé.
  const sousRang=elo<rank.min;
  // LA VOIE NE COMPTE PLUS RIEN. Elle portait quatre statistiques — parties
  // jouées, victoires, pièces débloquées, et la liste des dernières parties —
  // qui répondaient toutes à une question que personne ne vient poser ici. On
  // vient y voir CE QUI RESTE À DÉBLOQUER : le rang, la distance jusqu'au
  // suivant, et la file des créatures. Rien d'autre.
  const banner=document.getElementById('voie-elo-banner');
  const label=sousRang
    ?'Rang '+rank.name+' acquis · remontez à '+rank.min+' ELO'
    :(nextRank?'Vers '+nextRank.name+' ('+nextRank.min+' ELO) · '+progress+'%':'Rang maximum atteint !');
  // LE MÉDAILLON DU RANG (rankMedalHTML, js/main.js) : la planche
  // assets/ranks/<id>.png est facultative, et l'<img> se retire d'elle-même
  // si le fichier manque — le bandeau retrouve alors exactement la mise en
  // page qu'il avait avant que les médaillons existent.
  banner.innerHTML=rankMedalHTML(rank.id,'rm-lg')+'<div class="veb-info"><div class="veb-rank-name" style="color:'+rank.color+'">'+rank.name+'</div><div class="veb-elo">'+elo+' <span>ELO</span></div><div class="veb-progress-wrap"><div class="veb-progress-bar" style="width:'+progress+'%;background:linear-gradient(90deg,'+rank.color+',var(--gold))"></div></div><div class="veb-progress-label'+(sousRang?' veb-below':'')+'">'+label+'</div></div>';
  const route=document.getElementById('voie-route');let html='';
  let lastRankId=null;
  // Alternance gauche/droite : un compteur À PART, incrémenté uniquement
  // pour les jalons réellement rendus (pas les bandeaux de rang, qui sont un
  // sibling de plus dans .voie-route et décalaient la parité de tout ce qui
  // suit si on la confiait à nth-child en CSS — deux jalons consécutifs
  // pouvaient alors atterrir du même côté juste après un bandeau).
  let side=0;
  const sideCls=()=>(side++%2===0)?'vm-l':'vm-r';
  UNLOCK_MILESTONES.forEach((milestone,idx)=>{
    // Les cinq jalons de départ (Roi, Dame et les trois Gardes — `starter`)
    // sont à 0 ELO, donc numériquement dans la tranche Bois, mais ils ne
    // portent PAS son bandeau : ils forment le socle tout en bas de la Voie,
    // sous l'arène. Le bandeau Bois s'ouvre normalement au jalon suivant
    // (les 20 perles à 25 ELO), premier jalon non-`starter`.
    if(!milestone.starter){
      const mRank=vvGetRank(milestone.eloRequired);
      if(mRank.id!==lastRankId){lastRankId=mRank.id;html+='<div class="vm-rank-section"><div class="vm-rank-bar">'+rankMedalHTML(mRank.id,'rm-sm')+'<span class="vm-rank-label" style="color:'+mRank.color+'">'+mRank.name+'</span><span class="vm-rank-range">'+mRank.min+'–'+(mRank.max===9999?'∞':mRank.max)+' ELO</span></div></div>';}
    }
    // Jalon de récompense (perles / exemplaires) : ni pièce à débloquer, ni
    // texte de palier — juste un petit lot versé dès que l'ELO l'atteint
    // (vvCheckRewardMilestones, appelé en fin de partie).
    if(milestone.reward){
      // Un jalon FRANCHI l'est pour toujours : on le lit sur le sommet
      // atteint, pas sur le classement du moment. Une mauvaise série ne
      // doit pas rallumer en « verrouillé » un lot déjà encaissé.
      const reached3=peak>=milestone.eloRequired;
      const body=milestone.reward==='pearls'
        ?(pearlAmountHTML?pearlAmountHTML(milestone.amount,1.6):milestone.amount+' perles')
        :'<span class="vm-piece-emoji">'+pieceIcon(milestone.copyId,'n')+'</span><div class="vm-piece-name">×'+milestone.qty+'</div>';
      html+='<div class="voie-milestone '+sideCls()+'"><div class="vm-card vm-reward '+(reached3?'reached':'locked-milestone')+'" style="text-align:center">'+body+'</div><div class="vm-center"><div class="vm-dot'+(reached3?' reached':'')+'"></div><div class="vm-elo-badge">'+milestone.eloRequired+' ELO</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';
      return;
    }
    if(!milestone.pieceId){const reached2=peak>=milestone.eloRequired;html+='<div class="voie-milestone '+sideCls()+'"><div class="vm-card '+(reached2?'reached':'locked-milestone')+'" style="text-align:center"><div class="vm-piece-name">'+milestone.label+'</div></div><div class="vm-center"><div class="vm-dot'+(reached2?' reached':'')+'"></div><div class="vm-elo-badge">'+milestone.eloRequired+' ELO</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';return;}
    const pd=PIECES.find(p=>p.id===milestone.pieceId);if(!pd)return;
    const reached=peak>=milestone.eloRequired&&VV_UNLOCKED.has(milestone.pieceId);
    const isCurrent=!reached&&peak<milestone.eloRequired&&(idx===0||(UNLOCK_MILESTONES[idx-1]&&peak>=UNLOCK_MILESTONES[idx-1].eloRequired));
    const dotCls=reached?'vm-dot reached':isCurrent?'vm-dot current-milestone':'vm-dot';
    const cardCls=reached?'vm-card reached':isCurrent?'vm-card current-milestone':'vm-card locked-milestone';
    // LE JALON NE DIT PLUS QUE DEUX CHOSES : quelle créature, et à quel ELO.
    // Il portait aussi sa catégorie, sa valeur en points et les 80 premiers
    // caractères de son pouvoir — trois lignes de plus par jalon, sur une
    // page qui en aligne une quinzaine, pour des détails qui ne servent pas
    // ici : on ne compose pas son armée sur la Voie, on regarde ce qui reste
    // à décrocher. Le détail complet est dans la fiche de la pièce (bottom
    // sheet du builder, js/piece-card.js).
    html+='<div class="voie-milestone '+sideCls()+'"><div class="'+cardCls+'"><span class="vm-piece-emoji">'+pieceIcon(pd.id,'n')+'</span><div class="vm-piece-name">'+pd.name+'</div></div><div class="vm-center"><div class="'+dotCls+'"></div><div class="vm-elo-badge">'+(milestone.eloRequired===0?'Départ':milestone.eloRequired+' ELO')+'</div></div><div style="flex:1;max-width:calc(50% - 40px)"></div></div>';
  });
  route.innerHTML=html;
  voieAutoScroll(route);
}

// La Voie a été une face du cube ; c'est de nouveau une page à part entière,
// ouverte par le bouton « Voie » posé à côté de l'ELO sur le menu principal
// (js/cube-nav.js). D'où le bouton de sortie explicite ci-dessous : une page
// en surimpression n'a pas de flèche de cube pour en sortir.
//
// UN SEUL BOUTON « OK », épinglé en bas de l'écran (voir .voie-ok-bar dans
// css/style.css), plutôt qu'un « ← Retour » dans l'en-tête : la Voie peut
// être longue (une quinzaine de jalons), il fallait la remonter en entier
// pour sortir. Le bouton reste sous le pouce, où qu'on ait défilé.
document.getElementById('voie-ok')?.addEventListener('click',()=>{
  if(typeof goToMainMenu==='function')goToMainMenu();else showPage('page-armies');
});

// ----------------------------------------------------------------
// POSITION D'ARRIVÉE SUR LA VOIE
// ----------------------------------------------------------------
// C'est le conteneur de la page qui défile (.page.active est en
// position:fixed avec son propre overflow), pas le document.
//
// La Voie se lit maintenant du bas (le départ) vers le haut (voir
// [VOIE]/.voie-route dans css/style.css, column-reverse) : la page elle-même
// ne défile PAS à l'envers, seuls les jalons qu'elle contient sont empilés en
// sens inverse — au repos (scrollTop 0), on voit donc le HAUT du chemin
// (Or Légendaire), et « le début » (Roi, tout en bas) est en scrollTop
// MAXIMUM, après le dernier jalon.
//
// La toute première fois qu'un compte ouvre la Voie, elle glisse du haut
// vers le bas pour montrer d'un geste toute l'étendue du chemin possible.
// Les fois suivantes, inutile de refaire ce voyage à chaque fois : la page
// s'ouvre directement sur le jalon EN COURS — sans quoi revoir sa
// progression coûtait, à chaque passage, un défilement jusqu'en bas.
// Ce n'est plus #page-voie qui défile : la page est une colonne flex (pour
// garder le bouton OK au bas de l'écran, voir [VOIE] dans css/style.css) et
// c'est .voie-scroll, son premier élément, qui porte le défilement.
function voieScrollHost(){
  return document.getElementById('voie-scroll')||document.scrollingElement;
}

function voieAutoScroll(){
  const host=voieScrollHost();
  if(!host)return;
  const firstVisit=!accGet('voie_seen',false);
  // renderVoiePage() est appelée AVANT showPage('page-voie') (voir
  // js/cube-nav.js) : la page est encore masquée ici, sans la moindre
  // géométrie (scrollHeight à 0, scrollIntoView sans effet). On attend la
  // frame suivante — après quoi showPage() a déjà posé la classe .active,
  // synchrone, dans le même tick — pour que le positionnement porte sur une
  // page réellement affichée.
  requestAnimationFrame(()=>{
    if(firstVisit){
      accSet('voie_seen',true);
      voieRevealSlide(host);
    }else{
      // Pas de défilement animé ici : on veut arriver directement, pas
      // regarder un trajet qu'on a déjà vu au premier passage.
      const cur=host.querySelector('.current-milestone');
      if(cur)(cur.closest('.voie-milestone')||cur).scrollIntoView({block:'center'});
    }
  });
}

// Glissement du haut vers le bas, au tout premier passage : ease-out, comme
// une bille qui se pose (vite au départ, elle ralentit en approchant le bas,
// c'est-à-dire le départ du chemin).
let _voieRevealRaf=null;
function voieRevealSlide(host){
  if(_voieRevealRaf)cancelAnimationFrame(_voieRevealRaf);
  const start=host.scrollTop;
  const target=host.scrollHeight-host.clientHeight;
  const dist=target-start;
  if(dist<=0)return; // tout tient déjà à l'écran
  const duration=Math.min(1800,Math.max(600,dist*0.9));
  const t0=performance.now();
  const ease=t=>1-Math.pow(1-t,3);
  const step=now=>{
    const t=Math.min(1,(now-t0)/duration);
    host.scrollTop=start+dist*ease(t);
    if(t<1)_voieRevealRaf=requestAnimationFrame(step);
    else{host.scrollTop=target;_voieRevealRaf=null;}
  };
  _voieRevealRaf=requestAnimationFrame(step);
}

// Bouton « Retour au début » : le début du chemin (Roi, Bois) est maintenant
// en BAS de la page (scrollTop maximum), pas en haut — la Voie s'y rend donc
// en DESCENDANT (ease-in, comme une bille qui dévale une pente).
let _voieScrollRaf=null;
function voieSmoothToStart(){
  const host=voieScrollHost();
  if(!host)return;
  if(_voieScrollRaf)cancelAnimationFrame(_voieScrollRaf);
  const start=host.scrollTop;
  const target=host.scrollHeight-host.clientHeight;
  const dist=target-start;
  if(dist<=0)return;
  const duration=Math.min(1100,Math.max(420,dist*0.55));
  const t0=performance.now();
  // ease-in cubique : lent au départ, de plus en plus rapide.
  const ease=t=>t*t*t;
  const step=now=>{
    const t=Math.min(1,(now-t0)/duration);
    host.scrollTop=start+dist*ease(t);
    if(t<1)_voieScrollRaf=requestAnimationFrame(step);
    else{host.scrollTop=target;_voieScrollRaf=null;}
  };
  _voieScrollRaf=requestAnimationFrame(step);
}
document.getElementById('voie-scroll-top').addEventListener('click',voieSmoothToStart);

// Le bouton ne sert à rien quand on est déjà en bas (au début) : il
// n'apparaît qu'une fois la page réellement remontée vers les hauts rangs.
(function(){
  const btn=document.getElementById('voie-scroll-top');
  if(!btn)return;
  const host=voieScrollHost();
  if(!host||!host.addEventListener)return;
  const sync=()=>{
    const dist=(host.scrollHeight-host.clientHeight)-host.scrollTop;
    btn.style.visibility=dist>320?'':'hidden';
  };
  host.addEventListener('scroll',sync,{passive:true});
  sync();
})();
