import type { BotTemplate } from "../template";
import { BOTS as beautyFitness } from "./beauty_fitness";
import { BOTS as community } from "./community";
import { BOTS as creativeTech } from "./creative_tech";
import { BOTS as educationCare } from "./education_care";
import { BOTS as eventsTravelAuto } from "./events_travel_auto";
import { BOTS as food } from "./food";
import { BOTS as health } from "./health";
import { BOTS as professional } from "./professional";
import { BOTS as property } from "./property";
import { BOTS as retail } from "./retail";
import { BOTS as trades } from "./trades";

// The specialised bots, one file per group of industries.
export const CATALOG: BotTemplate[] = [
  ...health, ...professional, ...property, ...trades,
  ...food, ...retail, ...beautyFitness, ...educationCare, ...creativeTech, ...eventsTravelAuto, ...community,
];
