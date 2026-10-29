import type { Tier } from "../deepseek";
import type { Schedule } from "../engine/schedule";

// A bot template: one specialised job a business can hire a bot for. Every bot is a persona with a name, a hue
// and a desk prop, like the core team (Penny, Sage, Ledger, Nudge, Dawn). Templates live in code
// (lib/bots/core.ts and lib/bots/catalog/*); a workspace's `bots` rows are the ones it hired, keyed by template id.

// Industries, deliberately niche: onboarding asks which one fits, and the catalog is filtered by it.
export const INDUSTRIES = {
  general: "Any business",
  // health
  dental_general: "General dentistry",
  dental_ortho: "Orthodontics",
  dental_pediatric: "Pediatric dentistry",
  dental_cosmetic: "Cosmetic dentistry",
  medical_family: "Family medicine clinic",
  medical_specialist: "Specialist medical clinic",
  medspa: "Med spa & aesthetics",
  dermatology: "Dermatology clinic",
  physio: "Physiotherapy",
  chiro: "Chiropractic",
  massage: "Massage therapy",
  mental_health: "Therapy & counselling practice",
  optometry: "Optometry & eyewear",
  pharmacy: "Independent pharmacy",
  vet_small: "Small-animal vet clinic",
  vet_equine: "Equine & large-animal vet",
  // professional services
  law_family: "Family law",
  law_immigration: "Immigration law",
  law_injury: "Personal injury law",
  law_realestate: "Real estate law",
  law_business: "Business & corporate law",
  accounting_tax: "Tax preparation",
  bookkeeping: "Bookkeeping",
  cpa_firm: "Accounting firm (CPA)",
  insurance_broker: "Insurance brokerage",
  mortgage_broker: "Mortgage brokerage",
  financial_advisor: "Financial advisory",
  consulting: "Management consulting",
  coaching: "Business & life coaching",
  recruiting: "Recruiting & staffing",
  // property
  realestate_residential: "Residential real estate agents",
  realestate_commercial: "Commercial real estate",
  property_management: "Property management",
  short_term_rental: "Short-term rentals",
  // trades and home
  general_contractor: "General contracting",
  renovation: "Kitchen & bath renovation",
  roofing: "Roofing",
  plumbing: "Plumbing",
  hvac: "Heating & cooling (HVAC)",
  electrical: "Electrical contracting",
  landscaping: "Landscaping & snow removal",
  pool_service: "Pool service",
  pest_control: "Pest control",
  cleaning_residential: "Home cleaning",
  cleaning_commercial: "Commercial cleaning & janitorial",
  moving: "Moving company",
  // food and drink
  restaurant: "Full-service restaurant",
  cafe: "Café & coffee shop",
  bakery: "Bakery",
  catering: "Catering",
  food_truck: "Food truck",
  brewery: "Brewery & taproom",
  winery: "Winery",
  // retail and commerce
  retail_boutique: "Clothing boutique",
  retail_gifts: "Gift & home goods shop",
  bookstore: "Bookstore",
  florist: "Florist",
  jewelry: "Jewelry store",
  ecommerce_dtc: "Online store (direct to consumer)",
  ecommerce_marketplace: "Marketplace seller (Amazon, Etsy)",
  wholesale: "Wholesale & distribution",
  manufacturing: "Small manufacturing",
  makers_studio: "Craft studio & makers (ceramics, woodwork)",
  // beauty and fitness
  hair_salon: "Hair salon",
  barbershop: "Barbershop",
  nail_salon: "Nail salon",
  day_spa: "Day spa",
  tattoo: "Tattoo studio",
  gym: "Gym",
  yoga_pilates: "Yoga & pilates studio",
  personal_training: "Personal training",
  martial_arts: "Martial arts & dance school",
  // education and care
  tutoring: "Tutoring",
  music_school: "Music lessons",
  driving_school: "Driving school",
  daycare: "Daycare & preschool",
  senior_care: "Home care for seniors",
  // creative and tech
  marketing_agency: "Marketing agency",
  design_studio: "Design & branding studio",
  web_agency: "Web & app development agency",
  saas: "Software (SaaS)",
  it_msp: "IT services (MSP)",
  photography: "Photography",
  videography: "Video production",
  architecture: "Architecture",
  interior_design: "Interior design",
  // events, travel, auto, other
  wedding_planning: "Wedding & event planning",
  event_venue: "Event venue",
  hotel_bnb: "Hotel & B&B",
  travel_agency: "Travel agency",
  auto_repair: "Auto repair shop",
  auto_detailing: "Auto detailing",
  car_dealership: "Used car dealership",
  trucking: "Trucking & freight",
  courier: "Courier & delivery",
  pet_grooming: "Pet grooming",
  pet_boarding: "Pet boarding & daycare",
  dog_training: "Dog training",
  nonprofit: "Nonprofit",
  church: "Church & faith community",
  printing: "Print & sign shop",
} as const;
export type Industry = keyof typeof INDUSTRIES;

export const CATEGORIES = {
  communication: "Inbox & customers",
  sales: "Sales & leads",
  money: "Money",
  operations: "Operations",
  marketing: "Marketing",
  research: "Research & watching",
  people: "People & hiring",
  compliance: "Compliance & admin",
} as const;
export type Category = keyof typeof CATEGORIES;

// What sits on the bot's desk in the office view (the design's sprites: papers, books, coins, mug, plant ...).
export const PROPS = ["papers", "books", "coins", "mug", "plant", "phone", "calendar", "toolbox", "camera", "chart", "clipboard", "laptop", "box", "megaphone", "magnifier"] as const;
export type Prop = (typeof PROPS)[number];

// Which kind of connection a bot needs to be useful (shown when hiring, and on the Connections page).
export const NEEDS = ["email", "calendar", "accounting", "crm", "store", "web"] as const;
export type NeedKind = (typeof NEEDS)[number];

export interface BotTemplate {
  id: string; // "inbox", "dental_general.recall"
  name: string; // the persona: "Penny", "Molly"
  role: string; // the job label under the name: "Inbox", "Recall"
  title: string; // one line on the hiring card: "Brings patients back for their cleanings"
  hue: number; // 0-360, the oklch hue of its desk glow and avatar
  prop: Prop;
  category: Category;
  industries: Industry[]; // ["general"] = any business
  starter?: Industry[]; // suggested (pre-ticked) at onboarding for these industries
  needs: NeedKind[]; // connections it needs; hiring warns when one is missing
  instructions: string; // what it does and how, in plain sentences (its system prompt, after its role line)
  tier: Tier;
  proWriteUp?: string; // set: once the tool work is done, Pro writes the final answer from it
  tools: string[]; // names from TOOL_NAMES (lib/tools/names.ts)
  schedule: Schedule;
  scheduledTask?: string; // what it's told when the schedule fires; {since} = its last run (ISO)
}

// The task text for a scheduled run.
export function taskFor(t: BotTemplate, lastRunAt: string | null) {
  const since = lastRunAt ?? new Date(Date.now() - 24 * 3_600_000).toISOString();
  return (t.scheduledTask ?? "Do your scheduled job.").replaceAll("{since}", since);
}
