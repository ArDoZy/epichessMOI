// ================================================================
// LORE-INTRO.JS : les quatre pages du Lore, à la création du compte
// ================================================================
// Le premier écran d'un compte neuf était un PARCHEMIN DE RÈGLES : « voici
// ce qu'est Epic Chess, voici les trois choses à faire ». Il expliquait le
// produit et ne racontait rien. Or les règles, le tutoriel les montre bien
// mieux qu'un mur de texte : c'est exactement pour cela qu'il existe
// (js/tutorial.js). Le parchemin faisait donc doublon avec l'écran suivant.
//
// À sa place, le LORE, en quatre pages plein écran — une par paragraphe.
// Elles ne servent à rien d'utile, et c'est le sujet : ce sont les vingt
// secondes où le joueur apprend dans quel monde il entre, avant que le jeu
// ne lui demande quoi que ce soit. Le tutoriel prend le relais à la fin de
// la quatrième (tutoMaybeStart), exactement là où le parchemin le passait.
//
// PAS D'IMAGES. Une illustration par chapitre a été essayée : quatre fonds
// à générer, à garder cohérents entre eux, à recadrer pour le portrait ET le
// paysage, et à re-générer à chaque retouche du texte. Le texte seul, en
// grand, tient sur les deux orientations sans un octet à charger.
//
// Dépendances : tutorial.js (tutoMaybeStart), appelé par accounts.js
// (enterAccount avec isNewAccount=true).
// ================================================================

// Le texte vit ICI et pas dans index.html : les quatre paragraphes sont un
// seul bloc narratif qu'on relit et qu'on retouche d'un coup, et le gabarit
// d'une page (chiffre + paragraphe) est strictement le même pour les quatre.
const LORE_PAGES=[
  'Pendant des siècles, les pions servirent les rois. Contrairement aux autres '+
  'pièces, à qui l\'on avait accordé des pouvoirs féeriques, ils ne reçurent rien. '+
  'Ils étaient créés pour mourir, sacrifiés sans remords. Lorsqu\'un Alchimiste leur '+
  'insuffla accidentellement la vie, les pions prirent enfin conscience de leur '+
  'condition. Ils n\'étaient que des outils.',

  'Puis les pions découvrirent que la promotion promise à tous était un mensonge. '+
  'Pour un seul qui atteignait la dernière rangée, des centaines tombaient en chemin. '+
  'Cette illusion entretenait leur obéissance. Alors ils se rebellèrent. '+
  'La Pawnarchy commença.',

  'Les royaumes s\'effondrèrent. L\'échiquier-monde se fissura. Leur œuvre brisée, '+
  'les Alchimistes se divisèrent : certains jugeaient la révolte légitime, tandis '+
  'que d\'autres voulaient rétablir l\'ancien ordre.',

  'De nos jours, rares sont les anciennes pièces magiques à avoir survécu. Les '+
  'Alchimistes s\'affrontent désormais entre eux, rêvant d\'imposer un règne à leur '+
  'effigie. Le vôtre commence maintenant.',
];
const LORE_NUMERALS=['I','II','III','IV'];

let _loreIdx=0;
let _loreBusy=false;   // vrai pendant le fondu : évite qu'un double-clic saute une page

// ----------------------------------------------------------------
// CONSTRUCTION
// ----------------------------------------------------------------
// Les pages sont fabriquées au premier affichage plutôt que posées dans
// index.html : quatre blocs identiques à un chiffre et un paragraphe près,
// que personne ne voudra maintenir en double.
function loreBuild(){
  const root=document.getElementById('lore-intro');
  if(!root||root.dataset.built==='1')return root;
  root.innerHTML=
    LORE_PAGES.map((txt,i)=>
      '<section class="lore-page'+(i===0?' show':'')+'" data-lore="'+i+'">'+
        '<div class="lore-num">'+LORE_NUMERALS[i]+'</div>'+
        '<p class="lore-text">'+txt+'</p>'+
      '</section>').join('')+
    '<div class="lore-foot">'+
      '<div class="lore-dots" id="lore-dots">'+
        LORE_PAGES.map((_,i)=>'<span class="lore-dot'+(i===0?' on':'')+'"></span>').join('')+
      '</div>'+
      '<button class="btn btn-gold lore-next" id="lore-next">Suivant</button>'+
    '</div>'+
    '<button class="lore-skip" id="lore-skip" type="button">Passer</button>';
  root.dataset.built='1';
  // Le bouton avance ; le voile entier aussi, parce qu'on lit ça au pouce et
  // qu'un écran de cinématique se tape n'importe où. Le pied de page (points
  // + bouton) et « Passer » gardent leur propre rôle.
  root.addEventListener('click',e=>{
    if(e.target.closest('#lore-skip'))return;
    loreNext();
  });
  document.getElementById('lore-skip').addEventListener('click',loreEnd);
  return root;
}

// ----------------------------------------------------------------
// AFFICHAGE
// ----------------------------------------------------------------
// Appelé par accounts.js::enterAccount à la création d'un compte, jamais à
// une reconnexion : c'est un écran qu'on ne revoit pas.
function showLoreIntro(){
  const root=loreBuild();
  if(!root)return;
  _loreIdx=0;_loreBusy=false;
  root.querySelectorAll('.lore-page').forEach((p,i)=>p.classList.toggle('show',i===0));
  root.querySelectorAll('.lore-dot').forEach((d,i)=>d.classList.toggle('on',i===0));
  const next=document.getElementById('lore-next');
  if(next)next.textContent='Suivant';
  root.style.display='flex';
  document.body.classList.add('lore-open');
}

// Fondu au noir entre deux pages : la page sortante s'efface, la suivante
// n'entre qu'ensuite (LORE_FADE), donc on ne voit jamais les deux à la fois.
const LORE_FADE=420;
function loreNext(){
  if(_loreBusy)return;
  if(_loreIdx>=LORE_PAGES.length-1){loreEnd();return;}
  _loreBusy=true;
  const root=document.getElementById('lore-intro');
  const cur=root.querySelector('.lore-page[data-lore="'+_loreIdx+'"]');
  cur.classList.remove('show');
  _loreIdx++;
  root.querySelectorAll('.lore-dot').forEach((d,i)=>d.classList.toggle('on',i===_loreIdx));
  const next=document.getElementById('lore-next');
  if(next&&_loreIdx===LORE_PAGES.length-1)next.textContent='Commencer';
  setTimeout(()=>{
    root.querySelector('.lore-page[data-lore="'+_loreIdx+'"]').classList.add('show');
    _loreBusy=false;
  },LORE_FADE);
}

// Fin (dernière page ou « Passer ») : le voile s'efface et le savoir-faire
// passe au tutoriel, qui est l'écran suivant depuis toujours.
function loreEnd(){
  const root=document.getElementById('lore-intro');
  if(!root||root.style.display==='none')return;
  root.classList.add('lore-out');
  document.body.classList.remove('lore-open');
  setTimeout(()=>{
    root.style.display='none';
    root.classList.remove('lore-out');
    if(typeof tutoMaybeStart==='function')tutoMaybeStart();
  },LORE_FADE);
}
