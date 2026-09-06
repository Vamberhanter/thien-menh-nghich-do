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
  { key: WorldResourceTexture.PlantBloodBerry, url: gameAssetUrl('items/farm/plant-blood-berry.png') },
  { key: WorldResourceTexture.PlantSpiritHerb, url: gameAssetUrl('items/farm/plant-spirit-herb.png') },
  { key: WorldResourceTexture.PlantEssenceRoot, url: gameAssetUrl('items/farm/plant-essence-root.png') },
  { key: WorldResourceTexture.PlantEarthFruit, url: gameAssetUrl('items/farm/plant-earth-fruit.png') },
  { key: WorldResourceTexture.ChestCommon, url: gameAssetUrl('resources/chests/chest-common.png') },
  { key: WorldResourceTexture.ChestRare, url: gameAssetUrl('resources/chests/chest-rare.png') },
  { key: WorldResourceTexture.ChestEpic, url: gameAssetUrl('resources/chests/chest-epic.png') },
  { key: WorldResourceTexture.ChestLegendary, url: gameAssetUrl('resources/chests/chest-legendary.png') },
  { key: WorldResourceTexture.ChestMythic, url: gameAssetUrl('resources/chests/chest-mythic.png') },
  { key: WorldResourceTexture.RespawnShrine, url: gameAssetUrl('resources/shrines/respawn-shrine.png') },
  { key: WorldResourceTexture.WarpShrine, url: gameAssetUrl('resources/shrines/warp-shrine.png') },
] as const;
