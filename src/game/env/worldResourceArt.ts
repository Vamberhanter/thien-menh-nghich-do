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
  { key: WorldResourceTexture.PlantBloodBerry, url: 'assets/items/plant-blood-berry.png' },
  { key: WorldResourceTexture.PlantSpiritHerb, url: 'assets/items/plant-spirit-herb.png' },
  { key: WorldResourceTexture.PlantEssenceRoot, url: 'assets/items/plant-essence-root.png' },
  { key: WorldResourceTexture.PlantEarthFruit, url: 'assets/items/plant-earth-fruit.png' },
  { key: WorldResourceTexture.ChestCommon, url: 'assets/resources/chest-common.png' },
  { key: WorldResourceTexture.ChestRare, url: 'assets/resources/chest-rare.png' },
  { key: WorldResourceTexture.ChestEpic, url: 'assets/resources/chest-epic.png' },
  { key: WorldResourceTexture.ChestLegendary, url: 'assets/resources/chest-legendary.png' },
  { key: WorldResourceTexture.ChestMythic, url: 'assets/resources/chest-mythic.png' },
  { key: WorldResourceTexture.RespawnShrine, url: 'assets/resources/respawn-shrine.png' },
  { key: WorldResourceTexture.WarpShrine, url: 'assets/resources/warp-shrine.png' },
] as const;
