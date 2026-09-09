import { gameAssetUrl } from '../../net/assets';

export const WorldResourceTexture = {
  PlantBloodBerry: 'resource-plant-blood-berry',
  PlantSpiritHerb: 'resource-plant-spirit-herb',
  PlantEssenceRoot: 'resource-plant-essence-root',
  PlantEarthFruit: 'resource-plant-earth-fruit',
  ChestCommon: 'resource-chest-common',
  ChestRare: 'resource-chest-rare',
  ChestEpic: 'resource-chest-epic',
  ChestLegendary: 'resource-chest-legendary',
  ChestMythic: 'resource-chest-mythic',
  RespawnShrine: 'resource-respawn-shrine',
  WarpShrine: 'resource-warp-shrine',
} as const;

/**
 * Paths stay literal so `stripSourceSheets` can see that production code reaches
 * every generated image.
 */
export const WORLD_RESOURCE_TEXTURES = [
  { key: WorldResourceTexture.PlantBloodBerry, url: gameAssetUrl('assets/items/farm/plant-blood-berry.png') },
  { key: WorldResourceTexture.PlantSpiritHerb, url: gameAssetUrl('assets/items/farm/plant-spirit-herb.png') },
  { key: WorldResourceTexture.PlantEssenceRoot, url: gameAssetUrl('assets/items/farm/plant-essence-root.png') },
  { key: WorldResourceTexture.PlantEarthFruit, url: gameAssetUrl('assets/items/farm/plant-earth-fruit.png') },
  { key: WorldResourceTexture.ChestCommon, url: gameAssetUrl('assets/resources/chests/chest-common.webp') },
  { key: WorldResourceTexture.ChestRare, url: gameAssetUrl('assets/resources/chests/chest-rare.webp') },
  { key: WorldResourceTexture.ChestEpic, url: gameAssetUrl('assets/resources/chests/chest-epic.webp') },
  { key: WorldResourceTexture.ChestLegendary, url: gameAssetUrl('assets/resources/chests/chest-legendary.webp') },
  { key: WorldResourceTexture.ChestMythic, url: gameAssetUrl('assets/resources/chests/chest-mythic.webp') },
  { key: WorldResourceTexture.RespawnShrine, url: gameAssetUrl('assets/resources/shrines/respawn-shrine.webp') },
  { key: WorldResourceTexture.WarpShrine, url: gameAssetUrl('assets/resources/shrines/warp-shrine.webp') },
] as const;
