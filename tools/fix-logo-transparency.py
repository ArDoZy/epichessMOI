#!/usr/bin/env python3
"""
Rebouche les zones transparentes INTERNES d'un logo de pièce.

Les détoureurs automatiques (et les exports de ChatGPT) transforment le blanc
en transparence. Sur l'échiquier, ces trous laissent voir la couleur de la
case au lieu du blanc du logo.

Règle appliquée : toute zone transparente qui n'est PAS reliée au bord de
l'image est du blanc perdu -> on la repeint en blanc opaque.

Ça corrige d'un coup les deux variantes :
  - version blanche : le grand corps de la pièce redevient blanc
  - version noire   : la fente du casque et les fissures redeviennent blanches

Usage :
    python3 tools/fix-logo-transparency.py img/pieces/*.png
    python3 tools/fix-logo-transparency.py entree.png -o sortie.png
    python3 tools/fix-logo-transparency.py entree.png --preview

Dépendance : pip install pillow
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# Un pixel est considéré comme "plein" au-dessus de ce seuil d'alpha.
# 128 = on ignore l'anticrénelage semi-transparent des contours.
ALPHA_SEUIL = 128


def reboucher(img: Image.Image, couleur=(255, 255, 255)) -> tuple[Image.Image, int]:
    """Repeint en `couleur` opaque les régions transparentes fermées.

    Retourne (image corrigée, nombre de pixels repeints).
    """
    img = img.convert("RGBA")
    w, h = img.size

    # Marge de 2px pour garantir que le flood fill démarre bien à l'extérieur,
    # même si le dessin touche le bord de l'image.
    marge = 2
    alpha = Image.new("L", (w + 2 * marge, h + 2 * marge), 0)
    alpha.paste(img.getchannel("A"), (marge, marge))

    # Binarisation : 255 = matière, 0 = vide.
    matiere = alpha.point(lambda a: 255 if a >= ALPHA_SEUIL else 0)

    # On inonde le vide depuis le coin, en le marquant à 128.
    # Ce qui reste à 0 après coup, c'est le vide enfermé = le blanc perdu.
    ImageDraw.floodfill(matiere, (0, 0), 128)

    interieur = matiere.point(lambda v: 255 if v == 0 else 0).crop(
        (marge, marge, marge + w, marge + h)
    )

    n = interieur.histogram()[255]
    if n == 0:
        return img, 0

    # Le fond va SOUS le dessin d'origine : opaque dans les zones rebouchées,
    # et il épouse l'alpha existant ailleurs pour ne pas créer de liseré.
    fond_alpha = Image.new("L", (w, h))
    fond_alpha.paste(img.getchannel("A"))
    fond_alpha.paste(interieur, (0, 0), interieur)

    fond = Image.new("RGBA", (w, h), couleur + (0,))
    fond.putalpha(fond_alpha)

    return Image.alpha_composite(fond, img), n


def apercu(img: Image.Image, chemin: Path) -> None:
    """Écrit un damier de contrôle : si un trou subsiste, il se voit."""
    w, h = img.size
    c = max(w // 8, 1)
    damier = Image.new("RGBA", (w, h), (240, 217, 181, 255))
    d = ImageDraw.Draw(damier)
    for y in range(0, h, c):
        for x in range(0, w, c):
            if (x // c + y // c) % 2:
                d.rectangle([x, y, x + c - 1, y + c - 1], fill=(122, 31, 43, 255))
    Image.alpha_composite(damier, img).save(chemin)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("fichiers", nargs="+", type=Path, help="PNG à corriger")
    p.add_argument("-o", "--sortie", type=Path,
                   help="fichier de sortie (un seul fichier en entrée)")
    p.add_argument("--suffixe", default="",
                   help="suffixe ajouté au nom (défaut : écrase l'original)")
    p.add_argument("--couleur", choices=["blanc", "noir"], default="blanc",
                   help="couleur de rebouchage (défaut : blanc)")
    p.add_argument("--preview", action="store_true",
                   help="écrit aussi un -preview.png sur damier de contrôle")
    a = p.parse_args()

    if a.sortie and len(a.fichiers) > 1:
        p.error("-o ne marche qu'avec un seul fichier en entrée")

    couleur = (255, 255, 255) if a.couleur == "blanc" else (0, 0, 0)
    code = 0

    for src in a.fichiers:
        if not src.is_file():
            print(f"introuvable : {src}", file=sys.stderr)
            code = 1
            continue

        img, n = reboucher(Image.open(src), couleur)
        dst = a.sortie or src.with_name(f"{src.stem}{a.suffixe}{src.suffix}")
        img.save(dst)

        pct = 100 * n / (img.width * img.height)
        etat = f"{n} px rebouchés ({pct:.1f}%)" if n else "rien à reboucher"
        print(f"{src.name} -> {dst.name} : {etat}")

        if a.preview:
            chemin = dst.with_name(f"{dst.stem}-preview.png")
            apercu(img, chemin)
            print(f"  aperçu : {chemin.name}")

    return code


if __name__ == "__main__":
    sys.exit(main())
