#!/usr/bin/env python3
# ================================================================
# PREP-MENU-ART.PY : les huit planches du menu, detourees et versees
# ================================================================
# Un generateur d'images sort du PNG, et il le sort DEJA APLATI : ce qui
# devait etre transparent y arrive soit en noir plein (les deux plaques),
# soit sous la forme du damier gris que la previsualisation dessine derriere
# le vide (l'anneau et le livre). Poser ces fichiers tels quels au menu, ce
# serait coller huit rectangles opaques sur la grande salle.
#
# Ce script fait donc les deux moities du travail que `tools/opt-images.js`
# ne fait pas -- il RECONSTRUIT le canal alpha, puis convertit en WebP :
#
#   · LE NOIR DU RENDU. Un flood fill depuis le bord : seul le noir RELIE AU
#     BORD s'en va. Le noir de l'interieur d'un cadre (la gorge de l'anneau,
#     l'ombre entre deux volutes) est de la matiere, et il reste.
#   · LE DAMIER CUIT. Deux gris neutres et clairs, qu'aucune matiere peinte
#     ne porte -- l'or est sature, le bleu nuit est sombre. Les gemmes
#     blanches des losanges tombent avec, parce qu'elles sont neutres elles
#     aussi : elles sont rendues par `rebouche_petits_trous`, qui repeint les
#     trous FERMES et assez petits. Le grand vide central de l'anneau, lui,
#     pese trop pour etre un accident.
#
# Les PNG d'origine vivent dans assets/sources/menu/, hors du depot (voir
# .gitignore) : ce sont les fichiers qu'on retouche, jamais ceux qu'on sert.
#
#   python3 tools/prep-menu-art.py        (depuis la racine du depot)
#
# Dependances : pip install pillow scipy
# ================================================================
"""Detourage + conversion WebP des huit nouvelles planches du menu principal."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import PIL.ImageChops as C
from scipy import ndimage

SRC = 'assets/sources/menu'


def charge(nom):
    return Image.open(os.path.join(SRC, nom))


def canaux(im):
    r, g, b = im.convert('RGB').split()
    mx = C.lighter(C.lighter(r, g), b)
    mn = C.darker(C.darker(r, g), b)
    return mx, C.difference(mx, mn)          # luminance max, saturation


def cand_noir(im, seuil=34):
    """Candidat fond : le noir du rendu."""
    mx, _ = canaux(im)
    return mx.point(lambda v: 255 if v < seuil else 0)


def cand_damier(im, lum=205, sat_max=14):
    """Candidat fond : le damier de transparence cuit dans les pixels."""
    mx, sat = canaux(im)
    return C.multiply(mx.point(lambda v: 255 if v >= lum else 0),
                      sat.point(lambda v: 255 if v <= sat_max else 0))


def relie_au_bord(cand):
    """Ne garde du candidat que ce qui touche le bord de l'image."""
    w, h = cand.size
    m = 2
    pad = Image.new('L', (w + 2 * m, h + 2 * m), 255)
    pad.paste(cand, (m, m))
    ImageDraw.floodfill(pad, (0, 0), 128)
    return pad.point(lambda v: 255 if v == 128 else 0).crop((m, m, m + w, m + h))


def rebouche_petits_trous(alpha, part_max=0.02):
    """Repeint les trous FERMES qui pesent moins de `part_max` de l'image.

    Les gemmes claires des etoiles sont du blanc neutre : la cle du damier
    les emporte avec le fond. Elles sont enfermees dans le metal, donc
    reconnaissables a ca — au contraire du grand vide central de l'anneau,
    qui doit rester un vide.
    """
    a = np.array(alpha)
    trous, n = ndimage.label(a < 128)
    if n == 0:
        return alpha
    seuil = part_max * a.size
    bord = set(np.unique(np.concatenate([trous[0], trous[-1], trous[:, 0], trous[:, -1]])))
    tailles = ndimage.sum(np.ones_like(a), trous, range(1, n + 1))
    for i, t in enumerate(tailles, start=1):
        if i not in bord and t < seuil:
            a[trous == i] = 255
    return Image.fromarray(a)


def alpha_depuis(cand, erosion=1, flou=0.8):
    a = cand.point(lambda v: 0 if v == 255 else 255)
    for _ in range(erosion):
        a = a.filter(ImageFilter.MinFilter(3))
    return a.filter(ImageFilter.GaussianBlur(flou)) if flou else a


def pose(im, alpha):
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out


def recadre(im):
    bb = im.getchannel('A').getbbox()
    return im.crop(bb) if bb else im


def carre(im, cote):
    im = recadre(im)
    w, h = im.size
    c = max(w, h)
    fond = Image.new('RGBA', (c, c), (0, 0, 0, 0))
    fond.paste(im, ((c - w) // 2, (c - h) // 2))
    return fond.resize((cote, cote), Image.LANCZOS)


def largeur_max(im, l):
    if im.width <= l:
        return im
    return im.resize((l, round(im.height * l / im.width)), Image.LANCZOS)


def ecrire(im, dest, q=84):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    im.save(dest, 'WEBP', quality=q, method=6)
    print(f'{dest:42s} {im.size[0]:>5}x{im.size[1]:<5} {os.path.getsize(dest)//1024:>4} Ko')


# --- 1. Le fond du menu : opaque, il n'y a rien a detourer. ----------------
bg = charge('arriere-plan-grande-salle.png').convert('RGB').resize((1024, 1536), Image.LANCZOS)
ecrire(bg, 'assets/backgrounds/main-page.webp', 80)

# --- 2 et 3. Les deux plaques, rendues sur fond noir. ---------------------
for nom, dest, large in [('bouton combat.png', 'assets/ui/plaque-combat.webp', 1280),
                         ('cadre elo.png', 'assets/ui/cadre-arene.webp', 1024)]:
    src = charge(nom)
    a = alpha_depuis(relie_au_bord(cand_noir(src)), erosion=2, flou=0.9)
    ecrire(largeur_max(recadre(pose(src, a)), large), dest, 86)

# --- 4. L'ornement du titre : deja detoure a l'export. --------------------
ecrire(largeur_max(recadre(charge('ornement epic chess.png').convert('RGBA')), 1280),
       'assets/ui/ornement-titre.webp', 88)

# --- 5. L'anneau des voies : damier cuit, et un grand vide a garder. ------
src = charge('cercle recompense.png')
a = alpha_depuis(cand_damier(src), erosion=1, flou=0.7)
ecrire(carre(pose(src, rebouche_petits_trous(a)), 512), 'assets/ui/cercle-voie.webp', 88)

# --- 6. Le livre : damier cuit, gouttiere a rendre, halo a couper. -------
# La planche ne doit porter AUCUN effet peint (voir assets/ui/README.md) : la
# spirale de lumiere est dessinee et animee par le navigateur (.jtf-*), et un
# halo cuit dans l'image ferait double feu — allume pour toujours, par-dessus
# le marche. Le halo est blanc et neutre la ou il deborde du livre : on le
# refuse partout sauf dans la bande du livre lui-meme, puis on coupe ce qui
# depasse encore au-dessus des pages et au-dessous de la reliure.
src = charge('livre ok.png')
rgb = np.array(src.convert('RGB')).astype(int)
mx = rgb.max(2)
sat = mx - rgb.min(2)
bande = np.zeros(rgb.shape[:2], bool)
bande[300:1010, :] = True
mat = (~((mx >= 205) & (sat <= 14))) & (~((mx >= 200) & (sat < 40)) | bande)
mat = ndimage.binary_opening(mat, np.ones((3, 3)))
lbl, n = ndimage.label(mat)
mat = ndimage.binary_fill_holes(lbl == (np.argmax(ndimage.sum(mat, lbl, range(1, n + 1))) + 1))
cols = np.nonzero(mat.any(0))[0]
hauts = np.array([np.argmax(mat[:, c]) for c in cols])
bas = np.array([mat.shape[0] - 1 - np.argmax(mat[::-1, c]) for c in cols])
mat[:int(np.percentile(hauts, 35)), :] = False
mat[int(np.percentile(bas, 65)) + 1:, :] = False
a = Image.fromarray((mat * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.0))
ecrire(carre(pose(src, a), 256), 'assets/ui/logo-journaliere.webp', 88)

# --- 7 et 8. La couronne et l'eclair, deja detoures. ---------------------
for nom, dest in [('laurier ok.png', 'assets/ui/logo-victoires.webp'),
                  ('eclair ok.png', 'assets/ui/logo-richesse.webp')]:
    ecrire(carre(charge(nom).convert('RGBA'), 256), dest, 88)
