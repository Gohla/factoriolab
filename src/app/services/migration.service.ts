import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { combineLatest, first, map, Subject, switchMap, tap } from 'rxjs';

import { data } from 'src/data';
import { coalesce, filterNullish } from '~/helpers';
import {
  Entities,
  ObjectiveType,
  ZARRAYSEP,
  ZEMPTY,
  ZFIELDSEP,
  ZipSection,
  ZipVersion,
  ZLISTSEP,
  ZNULL,
  ZTRUE,
} from '~/models';
import { Recipes, Settings } from '~/store';
import { AnalyticsService } from './analytics.service';
import { ContentService } from './content.service';
import { TranslateService } from './translate.service';
import { ZipService } from './zip.service';

interface MigrationState {
  params: Entities<string>;
  warnings: string[];
  isBare: boolean;
}

enum MigrationWarning {
  ExpensiveDeprecation = 'The expensive setting has been removed. Please use or request an expensive data set instead.',
  LimitStepDeprecation = 'Limit steps have been replaced by limit objectives. Results may differ if using multiple objectives as limits apply to all objectives.',
}

@Injectable({
  providedIn: 'root',
})
export class MigrationService {
  store = inject(Store);
  analyticsSvc = inject(AnalyticsService);
  contentSvc = inject(ContentService);
  translateSvc = inject(TranslateService);
  zipSvc = inject(ZipService);

  /**
   * V6/V7 Disabled recipes have to be fixed up after data loads because state
   * depends on default values. Trigger this migration to be run after load via
   * this subject.
   */
  fixV8ExcludedRecipes$ = new Subject<void>();

  constructor() {
    /**
     * When migrating to V8, set `excluded` to `false` for any recipes which are
     * excluded by default but were not excluded in the migrated router state.
     */
    this.fixV8ExcludedRecipes$
      .pipe(
        switchMap(() =>
          this.store.select(Settings.selectMod).pipe(
            // eslint-disable-next-line @ngrx/avoid-mapping-selectors
            map((m) => m?.defaults),
            filterNullish(),
            first(),
          ),
        ),
        switchMap(() =>
          combineLatest({
            recipesRaw: this.store.select(Recipes.recipesState),
            recipesState: this.store.select(Recipes.selectRecipesState),
          }).pipe(first()),
        ),
        tap(({ recipesRaw, recipesState }) => {
          const values: {
            id: string;
            value: boolean;
            def: boolean | undefined;
          }[] = [];
          for (const id of Object.keys(recipesState)) {
            const value = recipesState[id].excluded;
            if (value && !recipesRaw[id]?.excluded) {
              values.push({ id, value: false, def: true });
            }
          }
          this.store.dispatch(Recipes.setExcludedBatch({ values }));
        }),
      )
      .subscribe();
  }

  /** Migrates older zip params to latest bare/hash formats */
  migrate(params: Entities, isBare: boolean): MigrationState {
    const v = (params[ZipSection.Version] as ZipVersion) ?? ZipVersion.Version0;
    this.analyticsSvc.event('unzip_version', v);

    if (isBare || v === ZipVersion.Version0) {
      Object.keys(params).forEach((k) => {
        params[k] = decodeURIComponent(params[k]);
      });
    }

    const result = this.migrateAny(params, isBare, v);
    this.displayWarnings(result.warnings);
    return result;
  }

  migrateAny(params: Entities, isBare: boolean, v: ZipVersion): MigrationState {
    const warnings: string[] = [];
    const state: MigrationState = { params, warnings, isBare };
    switch (v) {
      case ZipVersion.Version0:
        return this.migrateV0(state);
      case ZipVersion.Version1:
        return this.migrateV1(state);
      case ZipVersion.Version2:
        return this.migrateV2(state);
      case ZipVersion.Version3:
        return this.migrateV3(state);
      case ZipVersion.Version4:
        return this.migrateV4(state);
      case ZipVersion.Version5:
        return this.migrateV5(state);
      case ZipVersion.Version6:
        return this.migrateV6(state);
      case ZipVersion.Version7:
        return this.migrateV7(state);
      case ZipVersion.Version8:
        return this.migrateV8(state);
      case ZipVersion.Version9:
        return this.migrateV9(state);
      default:
        return { params, warnings, isBare };
    }
  }

  /** Migrates V0 bare zip to latest bare format */
  migrateV0(state: MigrationState): MigrationState {
    const { params } = state;
    if (params[ZipSection.Settings]) {
      // Reorganize settings
      const zip = params[ZipSection.Settings];
      const s = zip.split(ZFIELDSEP);
      // Convert modId to V1
      let modId = this.zipSvc.parseString(s[0]);
      modId = modId && data.modHash[data.modHashV0.indexOf(modId)];
      modId = modId ?? ZNULL;
      // Convert displayRate to V1
      const displayRateV0 =
        this.zipSvc.parseNumber(s[6]) ?? Settings.initialState.displayRate;
      const displayRateV1 = this.zipSvc.zipDiffDisplayRate(
        displayRateV0,
        Settings.initialState.displayRate,
      );
      params[ZipSection.Settings] = this.zipSvc.zipFields([
        modId,
        displayRateV1,
        params[ZipSection.Mod], // Legacy preset
        s[1], // excludedRecipeIds
        s[3], // beltId
        s[4], // fuelId
        s[5], // flowRate
        s[7], // miningBonus
        s[8], // researchSpeed
        s[10], // inserterCapacity
        s[9], // inserterTarget
        s[2], // expensive
        s[11], // cargoWagonId
        s[12], // fluidWagonId
      ]);
    } else if (params[ZipSection.Mod]) {
      params[ZipSection.Settings] = this.zipSvc.zipFields([
        ZNULL,
        ZNULL,
        params[ZipSection.Mod], // Legacy preset
      ]);
    }

    params[ZipSection.Version] = ZipVersion.Version1;
    return this.migrateV1(state);
  }

  /** Migrates V1 bare zip to latest bare format */
  migrateV1(state: MigrationState): MigrationState {
    const { params, warnings } = state;
    if (params[ZipSection.Settings]) {
      const zip = params[ZipSection.Settings];
      const s = zip.split(ZFIELDSEP);
      const index = 11; // Index of expensive field
      if (s.length > index) {
        // Remove expensive field
        const val = s.splice(index, 1);
        const expensive = this.zipSvc.parseBool(val[0]);
        if (expensive) {
          warnings.push(MigrationWarning.ExpensiveDeprecation);
        }
      }

      params[ZipSection.Settings] = this.zipSvc.zipFields(s);
    }

    params[ZipSection.Version] = ZipVersion.Version4;
    return this.migrateV4(state);
  }

  /** Migrates V2 hash zip to latest hash format */
  migrateV2(state: MigrationState): MigrationState {
    const { params } = state;
    if (params[ZipSection.Recipes]) {
      // Convert recipe settings
      const zip = params[ZipSection.Recipes];
      const list = zip.split(ZLISTSEP);
      const migrated = [];
      const index = 3; // Index of beaconCount field
      for (const recipe of list) {
        const s = recipe.split(ZFIELDSEP);
        if (s.length > index) {
          // Convert beaconCount from number to string format
          const asString = this.zipSvc.parseNNumber(s[index])?.toString();
          s[index] = this.zipSvc.zipTruthyString(asString);
        }

        migrated.push(this.zipSvc.zipFields(s));
      }

      params[ZipSection.Recipes] = migrated.join(ZLISTSEP);
    }

    if (params[ZipSection.Machines]) {
      // Convert machine settings
      const zip = params[ZipSection.Machines];
      const list = zip.split(ZLISTSEP);
      const migrated: string[] = [];
      const index = 2; // Index of beaconCount field
      for (const machine of list) {
        const s = machine.split(ZFIELDSEP);
        if (s.length > index) {
          // Convert beaconCount from number to string format
          const asString = this.zipSvc.parseNNumber(s[index])?.toString();
          s[index] = this.zipSvc.zipTruthyString(asString);
        }

        migrated.push(this.zipSvc.zipFields(s));
      }

      params[ZipSection.Machines] = migrated.join(ZLISTSEP);
    }

    params[ZipSection.Version] = ZipVersion.Version3;
    return this.migrateV3(state);
  }

  /** Migrates V3 hash zip to latest hash format */
  migrateV3(state: MigrationState): MigrationState {
    const { params, warnings } = state;
    if (params[ZipSection.Settings]) {
      const zip = params[ZipSection.Settings];
      const s = zip.split(ZFIELDSEP);
      const index = 10; // Index of expensive field
      if (s.length > index) {
        // Remove expensive field
        const val = s.splice(index, 1);
        const expensive = this.zipSvc.parseBool(val[0]);
        if (expensive) {
          warnings.push(MigrationWarning.ExpensiveDeprecation);
        }
      }

      params[ZipSection.Settings] = this.zipSvc.zipFields(s);
    }

    params[ZipSection.Version] = ZipVersion.Version5;
    return this.migrateV5(state);
  }

  private migrateInlineBeaconsSection(
    params: Entities,
    section: ZipSection,
    countIndex: number,
    beacons: string[],
  ): void {
    if (params[section]) {
      const zip = params[section];
      const list = zip.split(ZLISTSEP);
      const migrated: string[] = [];

      for (const s of list.map((z) => z.split(ZFIELDSEP))) {
        const moduleIdsIndex = countIndex + 1;
        const idIndex = moduleIdsIndex + 1;
        const totalIndex = idIndex + 3; // Only ever applied to recipes

        if (s.length > countIndex) {
          let id: string | undefined;
          let moduleIds: string | undefined;
          let total: string | undefined;

          // Move backwards from the last index, removing found properties
          if (s.length > totalIndex) {
            // Remove total field
            total = s.splice(totalIndex, 1)[0];
          }

          if (s.length > idIndex) {
            // Remove beaconId field
            id = s.splice(idIndex, 1)[0];
          }

          if (s.length > moduleIdsIndex) {
            // Remove modules field
            moduleIds = s.splice(moduleIdsIndex, 1)[0];
          }

          // Get beaconCount field
          const count = s[countIndex];

          // Replace beaconCount field with beacons field
          s[countIndex] = this.zipSvc.zipTruthyArray([beacons.length]);

          // Add beacon settings
          beacons.push(
            this.zipSvc.zipFields([
              count,
              this.zipSvc.zipTruthyString(moduleIds),
              this.zipSvc.zipTruthyString(id),
              this.zipSvc.zipTruthyString(total),
            ]),
          );
        }

        migrated.push(this.zipSvc.zipFields(s));
      }

      params[section] = migrated.join(ZLISTSEP);
    }
  }

  private migrateInlineBeacons(state: MigrationState): MigrationState {
    const list: string[] = [];

    this.migrateInlineBeaconsSection(
      state.params,
      ZipSection.RecipeObjectives,
      4,
      list,
    );
    this.migrateInlineBeaconsSection(state.params, ZipSection.Recipes, 3, list);

    if (list.length) {
      // Add beacon settings
      state.params[ZipSection.Beacons] = list.join(ZLISTSEP);
    }

    return state;
  }

  /** Migrates V4 bare zip to latest bare format */
  migrateV4(state: MigrationState): MigrationState {
    state = this.migrateInlineBeacons(state);
    state.params[ZipSection.Version] = ZipVersion.Version6;
    return this.migrateV6(state);
  }

  /** Migrates V5 hash zip to latest hash format */
  migrateV5(state: MigrationState): MigrationState {
    state = this.migrateInlineBeacons(state);
    state.params[ZipSection.Version] = ZipVersion.Version7;
    return this.migrateV7(state);
  }

  private migrateInsertField(
    params: Entities,
    section: ZipSection,
    index: number,
  ): void {
    if (params[section]) {
      const list = params[section].split(ZLISTSEP);
      for (let i = 0; i < list.length; i++) {
        const o = list[i].split(ZFIELDSEP);
        if (o.length > index) {
          o.splice(index, 0, '');
          list[i] = this.zipSvc.zipFields(o);
        }
      }

      params[section] = list.join(ZLISTSEP);
    }
  }

  private migrateDeleteField(
    params: Entities,
    section: ZipSection,
    index: number,
  ): void {
    if (params[section]) {
      const list = params[section].split(ZLISTSEP);
      for (let i = 0; i < list.length; i++) {
        const o = list[i].split(ZFIELDSEP);
        if (o.length > index) {
          o.splice(index, 1);
          list[i] = this.zipSvc.zipFields(o);
        }
      }

      params[section] = list.join(ZLISTSEP);
    }
  }

  private migrateMoveUpField(fields: string[], from: number, to: number): void {
    if (fields[from] != null) {
      const value = fields[from];
      fields.splice(from, 1);
      if (fields.length > to) {
        // Insert space to maintain length
        fields.splice(to, 0, '');
      }

      while (fields.length <= to) {
        fields.push('');
      }

      fields[to] = value;
    }
  }

  private migrateToV8(state: MigrationState): MigrationState {
    const { params, isBare } = state;
    let needsLimitDeprecationWarning = false;

    // RecipeObjectives: Insert type field
    this.migrateInsertField(params, ZipSection.RecipeObjectives, 2);

    /**
     * ItemObjectives: Convert via / limit step, convert machines rate type to
     * recipe objectives
     */
    if (params[ZipSection.Objectives]) {
      const list = params[ZipSection.Objectives].split(ZLISTSEP);
      const migrated = [...list];
      for (let i = 0; i < list.length; i++) {
        const obj = list[i];
        const o = obj.split(ZFIELDSEP);

        if (o[2] === '3') {
          if (isBare) {
            // Convert old RateType.Machines to recipe objectives
            const recipes = params[ZipSection.RecipeObjectives]
              ? params[ZipSection.RecipeObjectives].split(ZLISTSEP)
              : [];
            if (o.length > 3) {
              // Also switch into limit / maximize objectives
              const limit = [o[3], o[1], ObjectiveType.Limit.toString()];
              const maximize = [o[0], '1', ObjectiveType.Maximize.toString()];
              recipes.push(this.zipSvc.zipFields(maximize));
              recipes.push(this.zipSvc.zipFields(limit));
              needsLimitDeprecationWarning = true;
            } else {
              recipes.push(this.zipSvc.zipFields([o[0], o[1]]));
            }

            migrated.splice(i, 1);
            params[ZipSection.RecipeObjectives] = recipes.join(ZLISTSEP);
          } else {
            /**
             * Convert hashed RateType.Machines to simple item objective by a
             * number of items, since we can't recover the recipe id directly
             * from the hashed item id. I.E. prefer losing the objective unit
             * over losing the whole objective.
             */
            o[2] = '0';
            migrated[i] = this.zipSvc.zipFields(o);
          }
        } else {
          if (o.length > 3) {
            // Set up limit with via id & objective rate / rate type
            const limit = [o[3], o[1], o[2], ObjectiveType.Limit.toString()];
            // Convert original objective to maximize objective with weight of 1
            const maximize = [o[0], '1', '', ObjectiveType.Maximize.toString()];
            migrated[i] = this.zipSvc.zipFields(maximize);
            migrated.push(this.zipSvc.zipFields(limit));
            needsLimitDeprecationWarning = true;
          }
        }
      }

      if (needsLimitDeprecationWarning) {
        state.warnings.push(MigrationWarning.LimitStepDeprecation);
      }

      params[ZipSection.Objectives] = migrated.join(ZLISTSEP);
    }

    // Items: Remove recipeId
    this.migrateDeleteField(params, ZipSection.Items, 4);

    // Recipes: Insert excluded field
    this.migrateInsertField(params, ZipSection.Recipes, 1);

    /**
     * Settings: Insert researchedTechnologyIds and maximizeType, move
     * disabledRecipeIds into Recipes, move costs
     */
    if (params[ZipSection.Settings]) {
      const s = params[ZipSection.Settings].split(ZFIELDSEP);
      const x = isBare ? 1 : 0;

      // Convert disabled recipe ids
      if (s.length > 2 + x) {
        const disabledRecipeIds = this.zipSvc.parseArray(s[2 + x]);
        if (disabledRecipeIds) {
          const recipes = params[ZipSection.Recipes];
          const list = recipes ? recipes.split(ZLISTSEP) : [];
          for (const id of disabledRecipeIds) {
            let found = false;
            for (let i = 0; i < list.length; i++) {
              const r = list[i].split(ZFIELDSEP);
              if (r[0] === id) {
                found = true;
                r[1] = ZTRUE;
                list[i] = this.zipSvc.zipFields(r);
              }
            }

            if (!found) {
              list.push(this.zipSvc.zipFields([id, ZTRUE]));
            }
          }

          params[ZipSection.Recipes] = list.join(ZLISTSEP);

          this.fixV8ExcludedRecipes$.next();
        }

        s.splice(2 + x, 1);
      }

      // Insert researchedTechnologyIds
      s.splice(x, 0, '');

      // Move cost fields
      this.migrateMoveUpField(s, 16 + x, 20 + x);
      this.migrateMoveUpField(s, 15 + x, 19 + x);
      this.migrateMoveUpField(s, 14 + x, 18 + x);
      this.migrateMoveUpField(s, 13 + x, 17 + x);

      params[ZipSection.Settings] = this.zipSvc.zipFields(s);
    }

    params[ZipSection.Version] = ZipVersion.Version8;
    return state;
  }

  /** Migrates V6 bare zip to latest format */
  migrateV6(state: MigrationState): MigrationState {
    state.isBare = true;
    return this.migrateV8(this.migrateToV8(state));
  }

  /** Migrates V7 hash zip to latest format */
  migrateV7(state: MigrationState): MigrationState {
    state.isBare = false;
    return this.migrateV8(this.migrateToV8(state));
  }

  migrateV8(state: MigrationState): MigrationState {
    const { params } = state;

    // Need to convert Recipe Objectives to unified Objectives
    if (params[ZipSection.RecipeObjectives]) {
      let objectives: string[] = [];
      if (params[ZipSection.Objectives])
        objectives = params[ZipSection.Objectives].split(ZLISTSEP);

      const list = params[ZipSection.RecipeObjectives].split(ZLISTSEP);
      for (let i = 0; i < list.length; i++) {
        const o = list[i].split(ZFIELDSEP);
        const n = this.zipSvc.zipFields([
          o[0],
          o[1],
          '3',
          o[2],
          o[3],
          o[4],
          o[5],
          o[6],
          o[7],
        ]);
        objectives.push(n);
      }

      params[ZipSection.RecipeObjectives] = '';
      params[ZipSection.Objectives] = objectives.join(ZLISTSEP);
    }

    return this.migrateV9(state);
  }

  private migrateInlineModulesSection(
    params: Entities,
    section: ZipSection,
    index: number,
    modules: string[],
  ): void {
    if (params[section]) {
      const zip = params[section];
      const list = zip.split(ZLISTSEP);
      const migrated: string[] = [];

      for (const s of list.map((z) => z.split(ZFIELDSEP))) {
        if (s.length > index) {
          const moduleIdsStr = s[index];
          const moduleIds = this.zipSvc.parseArray(moduleIdsStr);
          if (moduleIds == null) continue;
          const moduleMap = new Map<string, number>();

          for (const moduleId of moduleIds) {
            const value = moduleMap.get(moduleId) ?? 0;
            moduleMap.set(moduleId, value + 1);
          }

          const moduleIndices = Array.from(moduleMap.keys()).map(
            (_, i) => modules.length + i,
          );

          // Replace moduleIds field with modules field
          s[index] = this.zipSvc.zipTruthyArray(moduleIndices);

          // Add module settings
          for (const key of moduleMap.keys()) {
            modules.push(
              this.zipSvc.zipFields([
                coalesce(moduleMap.get(key)?.toString(), ''),
                key,
              ]),
            );
          }
        }

        migrated.push(this.zipSvc.zipFields(s));
      }

      params[section] = migrated.join(ZLISTSEP);
    }
  }

  migrateV9(state: MigrationState): MigrationState {
    const { params } = state;

    const modules: string[] = [];
    this.migrateInlineModulesSection(
      state.params,
      ZipSection.Beacons,
      1,
      modules,
    );
    this.migrateInlineModulesSection(
      state.params,
      ZipSection.Recipes,
      3,
      modules,
    );
    this.migrateInlineModulesSection(
      state.params,
      ZipSection.Objectives,
      5,
      modules,
    );

    // Migrate machines state
    if (state.params[ZipSection.Machines]) {
      const zip = params[ZipSection.Machines];
      const list = zip.split(ZLISTSEP);
      const migrated: string[] = [];
      const beacons = state.params[ZipSection.Beacons]
        ? state.params[ZipSection.Beacons].split(ZLISTSEP)
        : [];

      const countIndex = 2;
      const moduleIdsIndex = countIndex + 1;
      const idIndex = moduleIdsIndex + 1;
      list
        .map((z) => z.split(ZFIELDSEP))
        .forEach((s, i) => {
          if (i === 0 && s[0] === ZTRUE) s[0] = ZEMPTY;

          // Move overclock after fuelId/fuelRankIds
          this.migrateMoveUpField(s, 5, 6);

          if (s[0] !== ZEMPTY && s[0] !== '') {
            if (s.length > 1) {
              // Convert module rank to modules
              const moduleIdsStr = s[1];
              if (moduleIdsStr) {
                const moduleId = moduleIdsStr.split(ZARRAYSEP)[0];
                s[1] = this.zipSvc.zipTruthyArray([modules.length]);
                modules.push(this.zipSvc.zipFields(['', moduleId]));
              }
            }
          }

          // Convert beacon properties to beacons
          if (s.length > 2) {
            let id: string | undefined;
            let moduleIndices: number[] | undefined;

            // Move backwards from the last index, removing found properties
            if (s.length > idIndex) {
              // Remove beaconId field
              id = s.splice(idIndex, 1)[0];
            }

            if (s.length > moduleIdsIndex) {
              // Remove modules field
              const moduleIdsStr = s.splice(moduleIdsIndex, 1)[0];
              if (moduleIdsStr) {
                const moduleId = moduleIdsStr.split(ZARRAYSEP)[0];
                moduleIndices = [modules.length];
                modules.push(this.zipSvc.zipFields(['', moduleId]));
              }
            }

            // Get beaconCount field
            const count = s[countIndex];

            // Replace beaconCount field with beacons field
            s[countIndex] = this.zipSvc.zipTruthyArray([beacons.length]);

            // Add beacon settings
            beacons.push(
              this.zipSvc.zipFields([
                count,
                this.zipSvc.zipTruthyArray(moduleIndices),
                this.zipSvc.zipTruthyString(id),
              ]),
            );
          }

          migrated.push(this.zipSvc.zipFields(s));
        });

      if (beacons.length)
        state.params[ZipSection.Beacons] = beacons.join(ZLISTSEP);

      state.params[ZipSection.Machines] = migrated.join(ZLISTSEP);
    }

    if (modules.length)
      state.params[ZipSection.Modules] = modules.join(ZLISTSEP);

    // Move fuelRankIds to Machines state
    if (params[ZipSection.Settings]) {
      const s = params[ZipSection.Settings].split(ZFIELDSEP);
      const index = state.isBare ? 5 : 4;
      if (s.length > index) {
        const fuelRankIds = s.splice(index, 1)[0];

        if (params[ZipSection.Machines]) {
          const list = params[ZipSection.Machines]
            .split(ZLISTSEP)
            .map((l) => l.split(ZFIELDSEP));
          const s = list.find((l) => l[0] === ZEMPTY || l[0] === '');
          if (s) {
            while (s.length < 4) s.push('');
            s[3] = fuelRankIds;
          } else {
            list.unshift(['', '', '', fuelRankIds]);
          }

          params[ZipSection.Machines] = list
            .map((l) => this.zipSvc.zipFields(l))
            .join(ZLISTSEP);
        } else {
          params[ZipSection.Machines] = ['', '', '', fuelRankIds].join(
            ZFIELDSEP,
          );
        }

        params[ZipSection.Settings] = s.join(ZFIELDSEP);
      }
    }

    params[ZipSection.Version] = ZipVersion.Version10;
    return state;
  }

  displayWarnings(warnings: string[]): void {
    this.translateSvc
      .multi(['app.migrationWarning', 'OK'])
      .pipe(first())
      .subscribe(([header, acceptLabel]) => {
        for (const message of warnings) {
          this.contentSvc.confirm({
            message,
            header,
            acceptLabel,
            rejectVisible: false,
          });
        }
      });
  }
}