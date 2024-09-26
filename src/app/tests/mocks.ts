import { Component } from '@angular/core';
import { data } from 'src/data';
import modJson from 'src/data/1.1/data.json';
import hashJson from 'src/data/1.1/hash.json';
import i18nJson from 'src/data/1.1/i18n/zh.json';

import { spread, toEntities } from '~/helpers';
import { ModData } from '~/models/data/mod-data';
import { ModHash } from '~/models/data/mod-hash';
import { ModI18n } from '~/models/data/mod-i18n';
import { AdjustedDataset, Dataset } from '~/models/dataset';
import { DisplayRate, displayRateInfo } from '~/models/enum/display-rate';
import { FlowDiagram } from '~/models/enum/flow-diagram';
import { Game } from '~/models/enum/game';
import { Language } from '~/models/enum/language';
import { LinkValue } from '~/models/enum/link-value';
import { ObjectiveType } from '~/models/enum/objective-type';
import { ObjectiveUnit } from '~/models/enum/objective-unit';
import { PowerUnit } from '~/models/enum/power-unit';
import { Preset } from '~/models/enum/preset';
import { SankeyAlign } from '~/models/enum/sankey-align';
import { SimplexResultType } from '~/models/enum/simplex-result-type';
import { Theme } from '~/models/enum/theme';
import { FlowData, Link, Node } from '~/models/flow';
import { MatrixResult } from '~/models/matrix-result';
import { Mod } from '~/models/mod';
import { isRecipeObjective, ObjectiveState } from '~/models/objective';
import { Rational, rational } from '~/models/rational';
import { BeaconSettings } from '~/models/settings/beacon-settings';
import { initialColumnsState } from '~/models/settings/column-settings';
import { FlowSettings } from '~/models/settings/flow-settings';
import { ItemState } from '~/models/settings/item-settings';
import { ModuleSettings } from '~/models/settings/module-settings';
import { RecipeState } from '~/models/settings/recipe-settings';
import { Step } from '~/models/step';
import { Entities } from '~/models/utils';
import { ThemeValues } from '~/services/theme.service';
import { ItemsService } from '~/store/items.service';
import { MachinesService } from '~/store/machines.service';
import { ObjectivesState } from '~/store/objectives.service';
import { PreferencesState } from '~/store/preferences.service';
import { RecipesService } from '~/store/recipes.service';
import {
  initialSettingsState,
  SettingsService,
} from '~/store/settings.service';
import { RecipeUtility } from '~/utilities/recipe.utility';

import { ItemId } from './item-id';
import { RecipeId } from './recipe-id';

export const raw = data;
export const modInfo = data.mods[0];
export const modData = modJson as unknown as ModData;
modData.defaults!.excludedRecipes = [RecipeId.NuclearFuelReprocessing];
export const modHash: ModHash = hashJson;
export const modI18n: ModI18n = i18nJson;
export const mod = spread(modInfo as Mod, modData);
export const defaults = SettingsService.computeDefaults(mod, Preset.Beacon8)!;
export function getDataset(): Dataset {
  return SettingsService.computeDataset(
    mod,
    modHash,
    undefined,
    Game.Factorio,
    defaults,
  );
}
export const dataset = getDataset();
export const categoryId = dataset.categoryIds[0];
export const item1 = dataset.itemEntities[dataset.itemIds[0]];
export const item2 = dataset.itemEntities[dataset.itemIds[1]];
export const recipe1 = dataset.recipeEntities[dataset.recipeIds[0]];
export const objective1: ObjectiveState = {
  id: '1',
  targetId: ItemId.AdvancedCircuit,
  value: rational.one,
  unit: ObjectiveUnit.Items,
  type: ObjectiveType.Output,
};
export const objective2: ObjectiveState = {
  id: '2',
  targetId: ItemId.IronPlate,
  value: rational.one,
  unit: ObjectiveUnit.Belts,
  type: ObjectiveType.Input,
};
export const objective3: ObjectiveState = {
  id: '3',
  targetId: ItemId.PlasticBar,
  value: rational.one,
  unit: ObjectiveUnit.Items,
  type: ObjectiveType.Maximize,
};
export const objective4: ObjectiveState = {
  id: '4',
  targetId: ItemId.PetroleumGas,
  value: rational(100n),
  unit: ObjectiveUnit.Items,
  type: ObjectiveType.Limit,
};
export const objective5: ObjectiveState = {
  id: '5',
  targetId: RecipeId.PiercingRoundsMagazine,
  value: rational.one,
  unit: ObjectiveUnit.Machines,
  type: ObjectiveType.Output,
};
export const objective6: ObjectiveState = {
  id: '6',
  targetId: RecipeId.CopperPlate,
  value: rational.one,
  unit: ObjectiveUnit.Machines,
  type: ObjectiveType.Input,
};
export const objective7: ObjectiveState = {
  id: '7',
  targetId: RecipeId.FirearmMagazine,
  value: rational.one,
  unit: ObjectiveUnit.Machines,
  type: ObjectiveType.Maximize,
};
export const objective8: ObjectiveState = {
  id: '8',
  targetId: RecipeId.IronPlate,
  value: rational(10n),
  unit: ObjectiveUnit.Machines,
  type: ObjectiveType.Limit,
};
export const objectivesList = [
  objective1,
  objective2,
  objective3,
  objective4,
  objective5,
  objective6,
  objective7,
  objective8,
];
export const objectivesState: ObjectivesState = toEntities(objectivesList);
export const objectiveIds = objectivesList.map((p) => p.id);
export const objectiveSteps = {
  [objective1.id]: [] as [string, Rational][],
  [objective2.id]: [] as [string, Rational][],
  [objective3.id]: [[ItemId.PetroleumGas, rational.one]] as [
    string,
    Rational,
  ][],
  [objective4.id]: [[RecipeId.TransportBelt, rational.one]] as [
    string,
    Rational,
  ][],
};
export const itemSettings1: ItemState = {
  beltId: ItemId.TransportBelt,
  wagonId: ItemId.CargoWagon,
};
export const recipeSettings1: RecipeState = {
  machineId: ItemId.AssemblingMachine2,
  modules: [{ count: rational(2n), id: ItemId.Module }],
  beacons: [
    {
      count: rational.zero,
      id: ItemId.Beacon,
      modules: [{ count: rational(2n), id: ItemId.SpeedModule }],
    },
  ],
};
export const recipeSettings2: RecipeState = {
  machineId: ItemId.AssemblingMachine2,
  modules: [{ count: rational(2n), id: ItemId.Module }],
  beacons: [
    {
      count: rational.zero,
      id: ItemId.Beacon,
      modules: [{ count: rational(2n), id: ItemId.SpeedModule }],
    },
  ],
};
export const step1: Step = {
  id: `${item1.id}.${item1.id}`,
  itemId: item1.id,
  recipeId: item1.id,
  items: objective1.value,
  belts: rational(1n, 2n),
  wagons: rational(2n),
  machines: rational.one,
  power: rational.one,
  pollution: rational.one,
};
export const step2: Step = {
  id: `${item2.id}.${item2.id}`,
  itemId: item2.id,
  recipeId: item2.id,
  items: objective2.value,
  belts: rational.one,
  wagons: rational.one,
  machines: rational(2n),
  power: rational.zero,
  pollution: rational.zero,
};
export const steps = [step1, step2];
export const beltSpeed: Entities<Rational> = {
  [ItemId.ExpressTransportBelt]: rational(45n),
  [ItemId.TransportBelt]: rational(15n),
  [ItemId.Pipe]: rational(1500n),
};
export const itemsState: Entities<ItemState> = {};
for (const item of dataset.itemIds.map((i) => dataset.itemEntities[i])) {
  itemsState[item.id] = spread(itemSettings1);
}
export const recipesState: Entities<RecipeState> = {};
for (const recipe of dataset.recipeIds.map((i) => dataset.recipeEntities[i])) {
  recipesState[recipe.id] = spread(recipeSettings1);
}
export const settingsStateInitial = SettingsService.computeSettings(
  initialSettingsState,
  defaults,
  new Set(dataset.technologyIds),
);
export const itemsStateInitial = ItemsService.computeItemsSettings(
  {},
  settingsStateInitial,
  dataset,
);
export const machinesStateInitial = MachinesService.computeMachinesSettings(
  {},
  settingsStateInitial,
  dataset,
);
export function getRecipesState(): Entities<RecipeState> {
  return RecipesService.computeRecipesSettings(
    {},
    machinesStateInitial,
    settingsStateInitial,
    dataset,
  );
}
export const recipesStateInitial = getRecipesState();
export const costs = initialSettingsState.costs;
export function getAdjustedDataset(): AdjustedDataset {
  return RecipeUtility.adjustDataset(
    dataset.recipeIds,
    recipesStateInitial,
    itemsStateInitial,
    settingsStateInitial,
    getDataset(),
  );
}
export const adjustedDataset = getAdjustedDataset();
export const objectives = objectivesList.map((o) =>
  spread(o, {
    recipe: isRecipeObjective(o)
      ? adjustedDataset.adjustedRecipe[o.targetId]
      : undefined,
  }),
);
export const objective = objectives[0];
export const flowSettings: FlowSettings = {
  diagram: FlowDiagram.Sankey,
  linkSize: LinkValue.Items,
  linkText: LinkValue.Items,
  sankeyAlign: SankeyAlign.Justify,
  hideExcluded: true,
};
export const preferencesState: PreferencesState = {
  states: {
    [Game.Factorio]: { ['name']: 'z=zip' },
    [Game.DysonSphereProgram]: {},
    [Game.Satisfactory]: {},
    [Game.CaptainOfIndustry]: {},
    [Game.Techtonica]: {},
    [Game.FinalFactory]: {},
  },
  columns: initialColumnsState,
  rows: 50,
  disablePaginator: false,
  powerUnit: PowerUnit.Auto,
  language: Language.English,
  theme: Theme.Dark,
  bypassLanding: false,
  showTechLabels: false,
  hideDuplicateIcons: false,
  paused: false,
  convertObjectiveValues: false,
  flowSettings: flowSettings,
};
export const matrixResultSolved: MatrixResult = {
  steps: steps,
  resultType: SimplexResultType.Solved,
  time: 20,
};

const node = (
  id: string,
  includeHref: boolean,
  override?: Partial<Node>,
): Node => {
  const result = {
    name: id,
    text: id,
    color: 'black',
    id,
    stepId: id,
    posX: '0',
    posY: '0',
    viewBox: '0 0 64 64',
    href: includeHref ? 'data/1.1/icons.png' : '',
  };

  if (override) return spread(result, override);
  return result;
};

const link = (source: string, target: string): Link => {
  const name = `${source}-${target}`;
  return {
    name,
    text: name,
    color: 'black',
    source,
    target,
    value: 1,
  };
};

export const getFlow = (includeHref = false): FlowData => ({
  nodes: [
    node('r|0', includeHref),
    node('r|1', includeHref),
    node('r|2', includeHref, {
      machines: '1',
      machineId: 'machineId',
      recipe: adjustedDataset.recipeEntities[adjustedDataset.recipeIds[0]],
    }),
    node('o|3', includeHref),
    node('s|4', includeHref),
  ],
  links: [
    link('r|0', 'r|2'),
    link('r|1', 'r|2'),
    link('r|2', 'r|2'),
    link('r|2', 'o|3'),
    link('r|2', 's|4'),
  ],
});
export const flow = getFlow();
export const drInfo = displayRateInfo[DisplayRate.PerMinute];

export const lightOilSteps: Step[] = [
  {
    id: '0',
    itemId: ItemId.LightOil,
    items: rational(60n),
    output: rational(60n),
    machines: rational(1n, 51n),
    recipeId: RecipeId.HeavyOilCracking,
    recipeSettings: recipesStateInitial[RecipeId.HeavyOilCracking],
    parents: {
      '': rational.one,
    },
    outputs: { [ItemId.LightOil]: rational(5n, 17n) },
  },
  {
    id: '3',
    itemId: ItemId.HeavyOil,
    items: rational(4000n, 17n),
    machines: rational(4n, 51n),
    recipeId: RecipeId.AdvancedOilProcessing,
    recipeSettings: recipesStateInitial[RecipeId.AdvancedOilProcessing],
    parents: { '0': rational.one },
    outputs: {
      [ItemId.HeavyOil]: rational.one,
      [ItemId.LightOil]: rational(12n, 17n),
      [ItemId.PetroleumGas]: rational.one,
    },
  },
  {
    id: '2',
    itemId: ItemId.CrudeOil,
    items: rational(1600n, 17n),
    machines: rational(8n, 51n),
    recipeId: RecipeId.CrudeOil,
    recipeSettings: recipesStateInitial[RecipeId.CrudeOil],
    parents: { '3': rational.one },
    outputs: { [ItemId.CrudeOil]: rational.one },
  },
  {
    id: '4',
    itemId: ItemId.PetroleumGas,
    items: rational(880n, 17n),
    surplus: rational(880n, 17n),
  },
  {
    id: '1',
    itemId: ItemId.Water,
    items: rational(1100n, 17n),
    machines: rational(11n, 12240n),
    recipeId: RecipeId.Water,
    recipeSettings: recipesStateInitial[RecipeId.Water],
    outputs: { [ItemId.Water]: rational.one },
    parents: {
      '0': rational(3n, 11n),
      '1': rational(8n, 11n),
    },
  },
];

export const moduleSettings: ModuleSettings[] = [
  {
    id: ItemId.ProductivityModule3,
    count: rational(3n),
  },
  {
    id: ItemId.Module,
    count: rational.one,
  },
];

export const beaconSettings: BeaconSettings[] = [
  {
    count: rational(8n),
    id: ItemId.Beacon,
    modules: [{ id: ItemId.SpeedModule3, count: rational(2n) }],
  },
];

export const themeValues: ThemeValues = {
  textColor: 'white',
  successColor: 'black',
  successBackground: 'green',
  dangerColor: 'black',
  dangerBackground: 'red',
};

@Component({ standalone: true, template: '' })
export class MockComponent {}
