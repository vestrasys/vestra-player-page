# Media credits

Third-party footage and games visible on this page: the hero backdrop and the
demo recordings. The footer lists this table (`npm run build` reads it): Title, Author, Licence and
Source, with Attribution shown in place of Author when present. Markdown links
are kept; write a literal `|` as `\|`. Raw files and their provenance notes are
kept outside the repository (`SOURCES.md` next to them).

| Title | Author | Licence | Source | Attribution |
| --- | --- | --- | --- | --- |
| Big Buck Bunny (in the hero, menus and AI recordings and the window stills) | Blender Foundation | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [peach.blender.org](https://peach.blender.org/about/) | (c) copyright 2008, Blender Foundation / www.bigbuckbunny.org |
| Spring (at the end of the Plugin Store recording, played through VestraTube) | Blender Animation Studio | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [studio.blender.org/films/spring](https://studio.blender.org/films/spring/pages/about/) | © Blender Foundation \| cloud.blender.org/spring |
| Stunning Aurora Borealis in Night Sky Timelapse (hero backdrop) | [Frank Cone](https://www.pexels.com/@frank-cone-140140/) | [Pexels License](https://www.pexels.com/license/) | [Pexels](https://www.pexels.com/video/stunning-aurora-borealis-in-night-sky-timelapse-28889010/) | Video by Frank Cone from Pexels |
| Twin Dragons (open-source NES homebrew, in the VestraNES recording) | Garydos (music and design), surt (art), Shiru (SFX) | [zlib](https://zlib.net/zlib_license.html) (code), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) (graphics) | [github.com/Garydos/twin-dragons-nes](https://github.com/Garydos/twin-dragons-nes), graphics: [opengameart.org/content/twin-dragons](https://opengameart.org/content/twin-dragons) | |

Notes:

- Both films appear only as short excerpts shown playing inside Vestra
  Player, never as the film on its own:
  - Big Buck Bunny (the 60 fps 2160p "sunflower" render,
    `bbb_sunflower_2160p_60fps_normal.mp4`): the hero centre clip
    (`hero-menus-2`), the menus and AI recordings and their posters, the
    window frame stills, and the blurred back-row stills. Recoloured on
    screen (Picture Adjustments turns it grey and back; Colour Wheels grade it
    in the AI clip), cropped to the player window, scaled and cut; not sped
    up.
  - Spring: the last seconds of the Plugin Store recording (`store-2`), the
    official Blender Studio upload played through VestraTube, about 25 s into
    the film. Zoomed and cropped with the recording, which is cut and sped up
    in places; not recoloured.
- Licence sources (checked 2026-11-04): Big Buck Bunny,
  https://peach.blender.org/about/ (CC BY 3.0; for reused parts of the movie
  the credit "(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org").
  Spring, https://studio.blender.org/films/spring/pages/about/ (CC BY 4.0;
  the credit "© Blender Foundation | cloud.blender.org/spring").
- Vestra Player is not affiliated with or endorsed by the Blender Foundation.
  The footer says so under this table, with the excerpt note, in both
  languages (`ft.creditsNote` in `src/i18n.json`).
- Twin Dragons is the open-source NES homebrew by Garydos (music and design),
  surt (art) and Shiru (SFX), as its title screen credits them: code under the
  zlib licence (https://github.com/Garydos/twin-dragons-nes), graphics under
  CC BY 3.0 (https://opengameart.org/content/twin-dragons). It is not the
  commercial game of the same name by Broke Studio, and Vestra Player is not
  affiliated with its authors. The VestraNES recording (`nes-3`; a still of
  it is the hero card `hero-nes-2`) shows about 12 s of play, cropped to the
  player window and scaled; the ROM itself is not distributed with the page.
- Remove a row when its footage does not appear in any published recording;
  add one when it does.
- Blender Foundation logos and trademarks are not covered by the Creative
  Commons licences.
- Pexels clips need no attribution; the credit is a courtesy. The Pexels
  licence allows use on websites but not redistributing the clips unaltered
  (for example on stock or wallpaper sites). The aurora clip is used as the
  page background only in an altered form (trimmed, scaled, re-encoded with a
  loop blend, shown dimmed) and is not offered as a download.
