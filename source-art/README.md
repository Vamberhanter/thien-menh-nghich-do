# Source art layout

Vendor packs and concept sheets live here. Runtime copies are staged into
`public/assets/` by `npm run env:*` scripts and are gitignored when licensed.

```
source-art/
  gameplay/          Concept sheets cut by env:resources (stones, chests, shrines)
  drafts/            Scratch / AI drafts (not used by the game)
  Cute_Fantasy_Free/ FarmLand tiles, fences, house, animals (env:farm; non-commercial)
  packs/
    farm-rpg/        Farm RPG FREE 16x16 — crops, plants, chest icon
    monsters/        Monster Pack 1 — mob sprites
    characters/      Tiny RPG character packs (reference)
    environment/     Mana Seed seasonal sample
    icons/           items_sheet, items.zip, File.png (weapons)
    effects/         VFX zips (Effect and Bullet, Free Pixel Effects)
```

## Runtime (`public/assets`)

```
public/assets/
  characters/   Player atlases
  boss/         Boss atlases
  monsters/     Staged mob sprites
  environment/
    manaseed/   Mana Seed sheet
    farm/       Soil, path, fence, house, chicken (Cute Fantasy)
  ui/           Lobby portraits & HUD icons
  weapons/      Sword bag icons
  items/
    consumables/
    equipment/
    materials/   Breakthrough mats
    gems/
    farm/        Seeds, plants, growth stages, chest icon
  resources/
    stones/
    chests/
    shrines/
```
