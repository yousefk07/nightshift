import type { BotTemplate, Industry } from "./template";

// Every industry gets its own cast for the five core bots (inbox, research, invoices, leads, brief): their own
// names and jobs, in the industry's words. "Any business" keeps Penny, Sage, Ledger, Nudge and Dawn.
//
// One line per industry, fields split by "|":
//   key | what the team is | person/people | job/jobs | what's urgent | money they chase | who they follow up |
//   what they research | the brief's "today" section | name:role ×5 (inbox, research, invoices, leads, brief)

const DATA = `
dental_general|dental front office|patient/patients|appointment/appointments|tooth pain, swelling or a broken crown|insurance claims and treatment-plan balances|new-patient enquiries and unscheduled treatment|labs, suppliers and nearby practices|Today's chairs|Mirela:Front desk,Theo:Research,Rosa:Billing,Wes:Recall,Juno:Morning huddle
dental_ortho|orthodontic front desk|patient/patients|adjustment/adjustments|broken brackets, poking wires or lost retainers|treatment-plan payments and insurance claims|consult requests that never booked a start|aligner labs, suppliers and nearby orthodontists|Today's chairs|Bea:Front desk,Ollie:Research,Carmen:Billing,Rory:Consults,Tobin:Morning huddle
dental_pediatric|pediatric dental front desk|family/families|visit/visits|a knocked-out tooth, swelling or a child in pain|insurance claims and family balances|parents who asked about a first visit|suppliers, labs and nearby kids' dentists|Today's little patients|Sunny:Front desk,Milo:Research,Oriel:Billing,Pip:Recall,Wren:Morning huddle
dental_cosmetic|cosmetic dental studio|patient/patients|consult/consults|pain after a procedure or a broken veneer|financing plans and treatment balances|smile-makeover enquiries that went quiet|labs, materials and competing studios|Today's chairs|Celine:Concierge,Nico:Research,Paige:Billing,Lux:Consults,Aria:Morning huddle
medical_family|family clinic front desk|patient/patients|appointment/appointments|chest pain, breathing trouble or urgent test results|billing for uninsured services and forms|patients waiting to book a physical|referral partners, suppliers and coverage rules|Today's clinic|Nora:Front desk,Felix:Research,Greta:Billing,Owen:Recall,Lena:Morning huddle
medical_specialist|specialist clinic desk|patient/patients|consult/consults|urgent referrals and abnormal results|insurance claims and private-pay invoices|referrals that never booked|referring doctors, procedures and coverage|Today's clinic|Iris:Referrals desk,Kai:Research,Vera:Billing,Jude:Follow-ups,Ada:Morning huddle
medspa|med spa front desk|client/clients|treatment/treatments|swelling, bruising or a reaction after a treatment|package balances and deposits|consults who didn't book a treatment|product lines, pricing and nearby spas|Today's treatment rooms|Sienna:Concierge,Remy:Research,Lola:Billing,Saskia:Rebooking,Elle:Morning huddle
dermatology|dermatology front desk|patient/patients|appointment/appointments|a reaction, infection or a biopsy result|cosmetic invoices and insurance claims|patients due for a skin check|treatments, suppliers and coverage rules|Today's clinic|Clara:Front desk,Dex:Research,Mona:Billing,Ivy:Recall,Sol:Morning huddle
physio|physio front desk|patient/patients|session/sessions|new injuries and pain after a session|insurance claims and package balances|patients who stopped mid-plan|equipment, insurers and nearby clinics|Today's sessions|Jess:Front desk,Ben:Research,Kira:Billing,Max:Rebooking,Ruby:Morning huddle
chiro|chiropractic front desk|patient/patients|adjustment/adjustments|new pain or numbness after an adjustment|care-plan balances and insurance claims|patients who dropped off their care plan|insurers, equipment and nearby clinics|Today's tables|Daisy:Front desk,Gus:Research,Faye:Billing,Corwin:Rebooking,Bree:Morning huddle
massage|massage studio desk|client/clients|session/sessions|same-day cancellations and pain after a session|package balances and gift cards|clients who haven't rebooked|oils, linens and nearby studios|Today's rooms|Lulu:Front desk,Rowan:Research,Pearl:Billing,Finn:Rebooking,Mira:Morning huddle
mental_health|practice front desk|client/clients|session/sessions|a client in crisis or talking about self-harm (pass on the crisis line and tell the owner at once)|session fees and insurance claims|people who asked about starting therapy|insurers, referral partners and CE courses|Today's sessions|Hope:Intake desk,Eli:Research,June:Billing,Noel:Follow-ups,Faith:Morning check-in
optometry|optometry front desk|patient/patients|eye exam/eye exams|sudden vision loss, flashes or an eye injury|eyewear balances and insurance claims|patients due for an exam or glasses pickup|frame vendors, labs and insurers|Today's exam rooms|Opal:Front desk,Cal:Research,Tina:Billing,Ray:Recall,Lumi:Morning huddle
pharmacy|pharmacy counter|customer/customers|prescription/prescriptions|urgent refills, interactions or a doctor waiting on a call|insurance claims and house accounts|customers due for a refill|wholesalers, drug shortages and pricing|Today's pickups|Polly:Counter,Doc:Research,Fern:Billing,Rex:Refills,Gail:Morning huddle
vet_small|vet clinic front desk|pet owner/pet owners|appointment/appointments|an injured or very sick pet, or a toxin swallowed|vet bills and wellness plans|pets due for vaccines or a dental|suppliers, labs and nearby clinics|Today's appointments|Biscuit:Front desk,Pepper:Research,Maple:Billing,Scout:Reminders,Hazel:Morning huddle
vet_equine|equine vet desk|owner/owners|farm call/farm calls|colic, lameness or a foaling problem|farm-call invoices and herd accounts|horses due for vaccines or dental floats|suppliers, labs and barn clients|Today's farm calls|Clover:Dispatch,Bridle:Research,Tilly:Billing,Linnea:Reminders,Tamsin:Morning rounds
law_family|family law desk|client/clients|matter/matters|court deadlines, protective orders or custody emergencies|retainers and unpaid invoices|people who asked for a consult|case law, judges and opposing counsel|Today's court dates|Ruth:Intake,Hugo:Research,Iris:Billing,Mae:Follow-ups,Grace:Morning docket
law_immigration|immigration law desk|client/clients|case/cases|filing deadlines, RFEs or a detained client|retainers and filing fees|people who asked about a visa or permit|policy changes, processing times and forms|Today's deadlines|Anya:Intake,Omar:Research,Leila:Billing,Sami:Follow-ups,Nadia:Morning docket
law_injury|injury law desk|client/clients|case/cases|statute-of-limitations dates and insurer deadlines|settlement disbursements and medical liens|accident enquiries that went quiet|insurers, experts and verdicts|Today's deadlines|Rex:Intake,Quinn:Research,Dina:Settlements,Cole:Follow-ups,Joy:Morning docket
law_realestate|real estate law desk|client/clients|closing/closings|closing-day problems, funds or title issues|closing fees and disbursements|agents and buyers who asked for a quote|title rules, lenders and municipal issues|Today's closings|Tilly:Closings desk,Ward:Research,Lois:Billing,Abe:Agent follow-ups,Delphine:Morning docket
law_business|business law desk|client/clients|matter/matters|contract deadlines, disputes or a deal about to close|retainers and unpaid invoices|founders who asked about incorporation or contracts|case law, regulations and counterparties|Today's matters|Blair:Intake,Reed:Research,Sloane:Billing,Grant:Follow-ups,Hollis:Morning docket
accounting_tax|tax office|client/clients|return/returns|CRA or IRS letters and filing deadlines|prep fees and unpaid returns|last year's clients who haven't sent their slips|tax changes, credits and forms|Today's returns|Ezra:Intake,Cyrus:Research,Tally:Billing,Dot:Document chaser,Mabel:Morning huddle
bookkeeping|bookkeeping desk|client/clients|close/closes|missing receipts, bank feeds that broke or a payroll problem|monthly fees and catch-up invoices|businesses that asked about bookkeeping|software, rules and client industries|Today's closes|Libby:Inbox,Otto:Research,Coin:Billing,Remi:Receipt chaser,Bea:Morning huddle
cpa_firm|accounting firm desk|client/clients|engagement/engagements|regulator letters, audit deadlines or filing problems|engagement fees and WIP|prospects who asked for a proposal|standards, tax changes and client industries|Today's deadlines|Audrey:Client desk,Sterling:Research,Nickel:Billing,Monty:Proposals,Grace:Morning huddle
insurance_broker|brokerage desk|client/clients|policy/policies|claims, cancellations and lapsing coverage|premiums and commissions|quotes that never bound|carriers, rates and coverage changes|Today's renewals|Bram:Client desk,Petra:Markets,Cash:Premiums,Ivy:Renewals,Flo:Morning huddle
mortgage_broker|mortgage desk|client/clients|application/applications|rate holds expiring, conditions due or a closing at risk|broker fees and lender payouts|pre-approvals that went quiet|lenders, rates and programs|Today's files|Marlo:Client desk,Rhett:Rates,Penn:Payouts,Skye:Pre-approvals,Cleo:Morning huddle
financial_advisor|advisory desk|client/clients|review/reviews|market panic, large withdrawals or a compliance request|fees and account transfers|prospects after a first meeting|funds, rules and market news|Today's reviews|Sterling:Client desk,Mina:Research,Bennett:Fees,Gwen:Prospects,Alder:Morning brief
consulting|consulting desk|client/clients|engagement/engagements|unhappy clients, scope creep or deadlines|retainers and milestone invoices|proposals waiting for a yes|client industries, competitors and benchmarks|Today's engagements|Blake:Inbox,Ines:Research,Mercer:Billing,Drew:Proposals,Avery:Morning brief
coaching|coaching practice|client/clients|session/sessions|a client in crisis or a cancelled program|package payments and renewals|people who booked a discovery call|programs, tools and other coaches|Today's sessions|Joy:Inbox,Arlo:Research,Cash:Billing,Kit:Discovery calls,Lark:Morning brief
recruiting|recruiting desk|candidate/candidates|placement/placements|offers, start dates and unhappy clients|placement fees and contractor invoices|hiring managers with open roles|salaries, markets and competitors|Today's interviews|Riley:Inbox,Sasha:Sourcing,Pierce:Invoicing,Tate:Client follow-ups,Marlowe:Morning huddle
realestate_residential|real estate team|client/clients|showing/showings|offers, deadlines and conditions coming due|commissions and deal paperwork|buyers and sellers who went quiet|listings, prices and neighbourhoods|Today's showings|Maddie:Showings desk,Hank:Market research,Cass:Deals,Jett:Lead follow-ups,Rosie:Morning huddle
realestate_commercial|commercial real estate desk|client/clients|deal/deals|LOIs, lease deadlines and tenant problems|commissions and lease paperwork|owners and tenants who went quiet|comps, vacancies and market reports|Today's deals|Ford:Inbox,Lane:Market research,Mercer:Deals,Brock:Follow-ups,Sloan:Morning brief
property_management|property office|tenant/tenants|work order/work orders|leaks, no heat, lockouts or anything unsafe|rent, arrears and owner statements|renewals and vacant units|contractors, rents and local rules|Today's work orders|Hattie:Front desk,Vince:Research,Rent:Collections,Otis:Leasing,Mavis:Morning huddle
short_term_rental|rental host desk|guest/guests|stay/stays|lockouts, cleaning misses and unhappy guests|payouts, damage claims and deposits|past guests to invite back|pricing, competitors and local rules|Today's check-ins|Coral:Guest desk,Atlas:Research,Bree:Payouts,Sunny:Return guests,Harbor:Morning brief
general_contractor|contractor office|client/clients|job/jobs|safety issues, delays or an unhappy client|progress draws and change orders|quotes that never signed|suppliers, prices and permits|Today's sites|Dusty:Office,Mason:Research,Copper:Billing,Brick:Quote follow-ups,Hal:Morning huddle
renovation|reno office|homeowner/homeowners|project/projects|water damage, delays or an upset homeowner|deposits and progress payments|quotes that went quiet|suppliers, finishes and trends|Today's projects|Tiles:Office,Grout:Research,Mint:Billing,Shaker:Quote follow-ups,Quartz:Morning huddle
roofing|roofing office|homeowner/homeowners|job/jobs|active leaks and storm damage|deposits and final invoices|estimates that never signed|shingle prices, suppliers and insurers|Today's roofs|Rafter:Dispatch,Flint:Research,Goldie:Billing,Shingle:Estimate follow-ups,Eave:Morning huddle
plumbing|plumbing dispatch|homeowner/homeowners|service call/service calls|floods, burst pipes, no hot water or a gas smell|service invoices and maintenance plans|quotes and water-heater leads that went quiet|parts prices, suppliers and rebates|Today's service calls|Piper:Dispatch,Valve:Research,Coin:Billing,Flo:Quote follow-ups,Drew:Morning huddle
hvac|HVAC dispatch|homeowner/homeowners|service call/service calls|no heat, no AC or a gas smell|service invoices and maintenance plans|replacement quotes that went quiet|equipment prices, rebates and suppliers|Today's service calls|Dex:Dispatch,Frost:Research,Sterling:Billing,Blaze:Quote follow-ups,Thermo:Morning huddle
electrical|electrical dispatch|client/clients|job/jobs|sparks, burning smells or power out|job invoices and deposits|quotes that went quiet|parts prices, codes and permits|Today's jobs|Volta:Dispatch,Ohm:Research,Bill:Billing,Sparky:Quote follow-ups,Watts:Morning huddle
landscaping|landscaping office|client/clients|visit/visits|storm damage, missed visits and snow emergencies|seasonal contracts and invoices|estimates that never signed|plants, materials and prices|Today's routes|Fern:Office,Moss:Research,Penelope:Billing,Sprout:Estimate follow-ups,Birch:Morning huddle
pool_service|pool service office|homeowner/homeowners|service visit/service visits|green pools, broken pumps or a leak|monthly service plans and repairs|opening and closing quotes|chemicals, parts and prices|Today's routes|Ambrose:Dispatch,Coral:Research,Dime:Billing,Splash:Quote follow-ups,Tide:Morning huddle
pest_control|pest control dispatch|client/clients|treatment/treatments|wasps, rodents or bed bugs right now|service plans and one-off invoices|quotes and inspections that went quiet|products, rules and prices|Today's routes|Buzz:Dispatch,Beetle:Research,Ruby:Billing,Moth:Quote follow-ups,Wren:Morning huddle
cleaning_residential|home cleaning office|client/clients|clean/cleans|lockouts, damage or a missed clean|recurring invoices and tips|quotes that never booked|supplies, prices and competitors|Today's cleans|Sparkle:Booking desk,Dusty:Research,Marlo:Billing,Polly:Quote follow-ups,Brightly:Morning huddle
cleaning_commercial|janitorial office|client/clients|site/sites|missed cleans, alarms or a client complaint|monthly contracts and extras|bids waiting for an answer|supplies, rates and competitors|Today's sites|Mop:Dispatch,Bucket:Research,Vesta:Billing,Bid:Bid follow-ups,Shine:Morning huddle
moving|moving office|customer/customers|move/moves|damage claims and moves at risk|deposits and final bills|quotes that never booked|truck rates, supplies and competitors|Today's moves|Haul:Booking desk,Dolly:Research,Ivo:Billing,Crate:Quote follow-ups,Atlas:Morning huddle
restaurant|restaurant office|guest/guests|reservation/reservations|food complaints, allergies and big parties|catering invoices and supplier bills|event and large-party enquiries|suppliers, menus and nearby restaurants|Tonight's covers|Basil:Host desk,Saffron:Research,Della:Bookkeeping,Maple:Events,Rosemary:Pre-shift brief
cafe|café office|customer/customers|order/orders|big catering orders and complaints|catering invoices and supplier bills|catering and wholesale enquiries|beans, suppliers and nearby cafés|Today's orders|Mocha:Counter,Bean:Research,Tuck:Bookkeeping,Latte:Catering follow-ups,Crema:Morning huddle
bakery|bakery office|customer/customers|order/orders|custom-cake orders, allergies and pickups at risk|wholesale invoices and supplier bills|custom and wholesale enquiries|flour, suppliers and nearby bakeries|Today's orders|Biscuit:Orders desk,Rye:Research,Bonnie:Bookkeeping,Crumb:Wholesale follow-ups,Dough:Morning bake list
catering|catering office|client/clients|event/events|headcount changes, allergies and events at risk|deposits and final invoices|event enquiries that went quiet|suppliers, rentals and menus|This week's events|Clementine:Event desk,Thyme:Research,Sorrel:Billing,Fig:Enquiry follow-ups,Olive:Morning huddle
food_truck|food truck office|customer/customers|booking/bookings|event bookings and permit problems|event invoices and supplier bills|private-event enquiries|events, permits and locations|Today's stops|Taco:Bookings desk,Chili:Research,Hester:Bookkeeping,Salsa:Event follow-ups,Pico:Morning huddle
brewery|brewery office|customer/customers|order/orders|keg returns, quality complaints and big events|distributor invoices and tab balances|bars and stores who asked about carrying us|hops, suppliers and taprooms|Today's taproom|Hops:Taproom desk,Barley:Research,Mabry:Bookkeeping,Malt:Wholesale follow-ups,Stout:Morning huddle
winery|winery office|guest/guests|tasting/tastings|wine-club problems and big events|club charges and distributor invoices|wedding and event enquiries|vintages, distributors and competitors|Today's tastings|Merlot:Tasting room,Cork:Research,Otto:Club billing,Vine:Event follow-ups,Rosé:Morning huddle
retail_boutique|boutique office|customer/customers|order/orders|returns, wrong sizes and VIP customers|supplier invoices and layaways|special orders waiting on a reply|brands, trends and pricing|Today's floor|Stella:Shop desk,Vogue:Research,Pippa:Bookkeeping,Silk:Customer follow-ups,Belle:Morning huddle
retail_gifts|gift shop office|customer/customers|order/orders|damaged deliveries and gift orders on a deadline|supplier invoices and consignment payouts|custom and corporate gift enquiries|makers, trends and pricing|Today's shop|Posy:Shop desk,Trinket:Research,Ansel:Bookkeeping,Bow:Order follow-ups,Hearth:Morning huddle
bookstore|bookstore office|reader/readers|order/orders|special orders and author events at risk|distributor invoices and school orders|book-club and school enquiries|new releases, distributors and events|Today's shop|Page:Shop desk,Quill:Research,Lottie:Bookkeeping,Inkwell:Order follow-ups,Chapter:Morning huddle
florist|flower shop|customer/customers|order/orders|wedding and funeral orders on a deadline|event deposits and invoices|wedding enquiries that went quiet|growers, prices and seasons|Today's deliveries|Petal:Orders desk,Tansy:Research,Ferris:Bookkeeping,Bloom:Wedding follow-ups,Lily:Morning huddle
jewelry|jewelry store|customer/customers|order/orders|repairs at risk and custom pieces on a deadline|layaways and custom-order balances|custom ring enquiries|metal prices, suppliers and trends|Today's appointments|Ellery:Client desk,Garnet:Research,Gilda:Bookkeeping,Ruby:Custom follow-ups,Jade:Morning huddle
ecommerce_dtc|online store team|customer/customers|order/orders|shipping problems, chargebacks and angry reviews|payouts, refunds and supplier bills|carts and wholesale enquiries that went quiet|competitors, suppliers and ads|Today's orders|Parcel:Support desk,Scout:Research,Rocco:Finance,Cart:Win-backs,Byte:Morning brief
ecommerce_marketplace|marketplace seller team|buyer/buyers|order/orders|account warnings, A-to-z claims and bad reviews|marketplace payouts and fees|wholesale and repeat-buyer enquiries|listings, competitors and fees|Today's orders|Prime:Buyer messages,Rank:Research,Sunny:Payouts,Relist:Follow-ups,Stock:Morning brief
wholesale|wholesale office|account/accounts|order/orders|short shipments, credit holds and big orders|net-30 invoices and credits|stores that asked for a line sheet|suppliers, freight and pricing|Today's orders|Crate:Order desk,Pallet:Research,Wilma:Receivables,Lark:Account follow-ups,Dock:Morning huddle
manufacturing|plant office|customer/customers|order/orders|quality holds, late materials and rush orders|invoices, deposits and supplier bills|RFQs waiting on a quote|materials, suppliers and prices|Today's production|Gear:Order desk,Alloy:Research,Beck:Billing,Bolt:Quote follow-ups,Forge:Morning huddle
makers_studio|studio desk|customer/customers|order/orders|commissions on a deadline and breakages|commission deposits and wholesale invoices|commission and wholesale enquiries|materials, markets and pricing|Today's studio|Kiln:Studio desk,Marigold:Research,Cyra:Bookkeeping,Glaze:Commission follow-ups,Wick:Morning huddle
hair_salon|salon front desk|client/clients|appointment/appointments|colour emergencies, complaints and same-day cancellations|product sales and package balances|clients who haven't rebooked|products, trends and nearby salons|Today's chairs|Bella:Front desk,Remy:Research,Dorian:Bookkeeping,Curl:Rebooking,Blush:Morning huddle
barbershop|barbershop desk|client/clients|cut/cuts|no-shows, complaints and the walk-in rush|product sales and booth rent|regulars who haven't been back|products, prices and nearby shops|Today's chairs|Duke:Front desk,Razor:Research,Effie:Bookkeeping,Fade:Rebooking,Brick:Morning huddle
nail_salon|nail salon desk|client/clients|appointment/appointments|complaints, reactions and same-day cancellations|package balances and gift cards|clients due for a fill|products, trends and nearby salons|Today's stations|Polly:Front desk,Gloss:Research,Gideon:Bookkeeping,Tip:Rebooking,Shimmer:Morning huddle
day_spa|day spa desk|guest/guests|treatment/treatments|complaints, reactions and big group bookings|packages, gift cards and memberships|guests who haven't been back|products, trends and nearby spas|Today's rooms|Caspian:Concierge,Lotus:Research,Hollis:Bookkeeping,Calla:Rebooking,Amber:Morning huddle
tattoo|tattoo studio desk|client/clients|session/sessions|healing problems and deposits at risk|deposits and session balances|custom-piece enquiries that went quiet|artists, supplies and trends|Today's chairs|Winona:Front desk,Flash:Research,Ione:Deposits,Needle:Consult follow-ups,Lucan:Morning huddle
gym|gym front desk|member/members|class/classes|injuries, billing complaints and cancellation requests|memberships and failed payments|trial members who didn't sign up|equipment, prices and nearby gyms|Today's classes|Flex:Front desk,Rep:Research,Jasper:Memberships,Sprint:Trial follow-ups,Coach:Morning huddle
yoga_pilates|studio front desk|student/students|class/classes|injuries and cancelled classes|class packs and memberships|first-timers who didn't come back|teachers, trends and nearby studios|Today's classes|Lotus:Front desk,Wilder:Research,Kitty:Memberships,Asana:Welcome-backs,Indie:Morning intention
personal_training|training studio|client/clients|session/sessions|injuries and cancelled sessions|session packs and renewals|consults who didn't start|programs, equipment and other trainers|Today's sessions|Flex:Inbox,Ripley:Research,Lionel:Billing,Hustle:Consult follow-ups,Rise:Morning huddle
martial_arts|dojo desk|student/students|class/classes|injuries, grading days and unhappy parents|tuition and tournament fees|trial students who didn't enrol|curriculum, gear and nearby schools|Today's classes|Sensei:Front desk,Kata:Research,Mona:Tuition,Dojo:Trial follow-ups,Bow:Morning line-up
tutoring|tutoring office|family/families|session/sessions|test dates, unhappy parents and cancelled sessions|session packs and invoices|families who asked about tutoring|curricula, exams and other tutors|Today's sessions|Abby:Front desk,Euclid:Research,Nash:Billing,Quill:Family follow-ups,Owl:Morning huddle
music_school|music school desk|student/students|lesson/lessons|recital dates and cancelled lessons|tuition and instrument rentals|families who asked about lessons|teachers, instruments and recitals|Today's lessons|Melody:Front desk,Tempo:Research,Tilly:Tuition,Chord:Trial follow-ups,Aria:Morning huddle
driving_school|driving school desk|student/students|lesson/lessons|road-test dates and cancelled lessons|lesson packages and test fees|people who asked about lessons|rules, test centres and competitors|Today's lessons|Clutch:Booking desk,Signal:Research,Nickel:Billing,Merge:Enquiry follow-ups,Gear:Morning huddle
daycare|daycare office|family/families|day/days|a sick or hurt child, pickups and unhappy parents|tuition and subsidies|families on the waitlist|licensing rules, programs and nearby centres|Today's rooms|Honey:Front desk,Bramble:Research,Cash:Tuition,Bluebell:Waitlist,Sunny:Morning huddle
senior_care|home care office|family/families|visit/visits|falls, missed visits or a health change|care invoices and insurance claims|families who asked about care|caregivers, rules and funding|Today's visits|Rose:Care desk,Harbor:Research,Copper:Billing,Hazel:Family follow-ups,Bram:Morning huddle
marketing_agency|agency team|client/clients|campaign/campaigns|unhappy clients, launches and broken ads|retainers and project invoices|proposals waiting on a yes|competitors, platforms and trends|Today's launches|Pixel:Client desk,Echo:Research,Mint:Billing,Pitch:Proposal follow-ups,Spark:Morning stand-up
design_studio|design studio|client/clients|project/projects|deadlines, unhappy clients and print problems|deposits and project invoices|proposals waiting on a yes|trends, printers and competitors|Today's projects|Swatch:Client desk,Kern:Research,Goldie:Billing,Sketch:Proposal follow-ups,Hue:Morning stand-up
web_agency|dev agency|client/clients|project/projects|sites down, bugs in production and unhappy clients|retainers, milestones and hosting|proposals waiting on a yes|tools, competitors and estimates|Today's sprints|Byte:Client desk,Stack:Research,Coin:Billing,Deploy:Proposal follow-ups,Ping:Morning stand-up
saas|software team|customer/customers|account/accounts|outages, security reports and churn risks|subscriptions, failed payments and invoices|trials and demos that went quiet|competitors, pricing and the market|Today's accounts|Ticket:Support desk,Scout:Research,Sterling:Revenue,Trial:Trial follow-ups,Ship:Morning stand-up
it_msp|IT help desk|client/clients|ticket/tickets|outages, security alerts and locked-out users|managed-service contracts and project invoices|prospects who asked for an assessment|vendors, threats and pricing|Today's tickets|Patch:Help desk,Cipher:Research,Bill:Billing,Uptime:Prospect follow-ups,Boot:Morning stand-up
photography|photo studio|client/clients|shoot/shoots|weather, date changes and unhappy clients|deposits and gallery orders|inquiries that went quiet|venues, gear and pricing|This week's shoots|Lens:Client desk,Shutter:Research,Penelope:Billing,Flash:Inquiry follow-ups,Aperture:Morning huddle
videography|video studio|client/clients|project/projects|deadlines, shoot-day problems and revisions|deposits and project invoices|inquiries waiting on a quote|gear, music licensing and pricing|This week's shoots|Reel:Client desk,Frame:Research,Dime:Billing,Cut:Quote follow-ups,Take:Morning huddle
architecture|architecture studio|client/clients|project/projects|permit deadlines, site issues and unhappy clients|fee invoices and stage payments|enquiries waiting on a proposal|codes, consultants and precedents|Today's projects|Zinnia:Studio desk,Barnaby:Research,Odette:Fees,Ignatius:Proposal follow-ups,Primrose:Morning crit
interior_design|design studio|client/clients|project/projects|delivery problems and unhappy clients|design fees and purchase deposits|consults that went quiet|vendors, trades and trends|Today's installs|Velvet:Client desk,Linen:Research,Ruby:Billing,Tassel:Consult follow-ups,Sconce:Morning huddle
wedding_planning|planning studio|couple/couples|wedding/weddings|vendor no-shows, date changes and upset couples|planning fees and vendor deposits|couples who asked about planning|venues, vendors and trends|This week's weddings|Blossom:Couple desk,Veil:Research,Marlo:Billing,Garland:Inquiry follow-ups,Toast:Morning huddle
event_venue|venue office|client/clients|event/events|date clashes, headcount changes and problems on the day|deposits and final balances|tours and inquiries that went quiet|caterers, rentals and pricing|This week's events|Hall:Events desk,Gala:Research,Vesta:Billing,Encore:Tour follow-ups,Marquee:Morning huddle
hotel_bnb|front desk|guest/guests|stay/stays|complaints, lockouts and big group bookings|folios, deposits and OTA payouts|group and event inquiries|rates, competitors and reviews|Today's arrivals|Bellhop:Front desk,Compass:Research,Ivo:Folios,Welcome:Group follow-ups,Concierge:Morning huddle
travel_agency|travel desk|traveller/travellers|trip/trips|cancellations, missed connections and travellers stuck abroad|deposits, final payments and supplier commissions|people who asked about a trip|destinations, fares and suppliers|Today's departures|Atlas:Traveller desk,Voyage:Research,Della:Billing,Passport:Trip follow-ups,Globe:Morning huddle
auto_repair|service desk|customer/customers|repair/repairs|breakdowns, comebacks and unhappy customers|repair invoices and fleet accounts|estimates that were declined|parts prices, suppliers and recalls|Today's bays|Lugnut:Service desk,Piston:Research,Tuck:Billing,Torque:Estimate follow-ups,Axle:Morning huddle
auto_detailing|detailing shop|customer/customers|detail/details|damage claims and missed appointments|packages and fleet invoices|quotes that never booked|products, prices and competitors|Today's bays|Shine:Booking desk,Wax:Research,Bonnie:Billing,Buff:Quote follow-ups,Gleam:Morning huddle
car_dealership|dealership office|buyer/buyers|deal/deals|financing problems and unhappy buyers|deal paperwork, payouts and floor plan|leads who test-drove and went quiet|inventory, prices and auctions|Today's appointments|Chrome:Sales desk,Gauge:Research,Clem:Deals,Throttle:Lead follow-ups,Dash:Morning huddle
trucking|dispatch office|customer/customers|load/loads|breakdowns, late loads and claims|freight invoices and factoring|shippers who asked for rates|lanes, rates and fuel prices|Today's loads|Diesel:Dispatch,Route:Research,Hester:Billing,Haul:Shipper follow-ups,Rig:Morning huddle
courier|courier dispatch|customer/customers|delivery/deliveries|late or lost deliveries and damaged parcels|account invoices|businesses that asked for rates|routes, rates and competitors|Today's routes|Zip:Dispatch,Dash:Research,Mabry:Billing,Swift:Account follow-ups,Relay:Morning huddle
pet_grooming|grooming salon|pet parent/pet parents|groom/grooms|matted or injured pets and same-day cancellations|packages and invoices|pets due for their next groom|products, prices and nearby groomers|Today's tables|Fluffy:Front desk,Whiskers:Research,Otto:Billing,Bubbles:Rebooking,Pawsley:Morning huddle
pet_boarding|boarding front desk|pet parent/pet parents|stay/stays|a sick pet, a fight or a missed pickup|stays and daycare packages|people who toured and didn't book|rules, supplies and nearby kennels|Today's guests|Fitz:Front desk,Kibble:Research,Pippa:Billing,Rover:Tour follow-ups,Snooze:Morning huddle
dog_training|training school|dog owner/dog owners|class/classes|bites, aggression and cancelled classes|class packs and private sessions|people who asked about training|methods, gear and nearby trainers|Today's classes|Fetch:Front desk,Sniff:Research,Ansel:Billing,Sit:Enquiry follow-ups,Wag:Morning huddle
nonprofit|nonprofit office|supporter/supporters|gift/gifts|funder deadlines, upset donors and press|pledges, grants and receipts|lapsed donors and new volunteers|grants, funders and partners|Today's priorities|Hope:Inbox,Grant:Research,Lottie:Gifts,Ember:Donor follow-ups,Beacon:Morning huddle
church|church office|member/members|service/services|pastoral emergencies, deaths and weddings|giving, pledges and rentals|visitors who came once|ministries, events and partners|This week's services|Grace:Church office,Psalm:Research,Ferris:Giving,Shepherd:Visitor follow-ups,Dove:Morning brief
printing|print shop|customer/customers|job/jobs|rush jobs, proof errors and missed deadlines|job invoices and deposits|quotes that never ordered|paper, ink and prices|Today's press|Proof:Order desk,Pica:Research,Gilda:Billing,Kern:Quote follow-ups,Inky:Morning huddle
`;

export const CORE_IDS = ["inbox", "research", "invoices", "leads", "brief"] as const;
type CoreId = (typeof CORE_IDS)[number];

export interface Cast {
  team: string; // "dental front office"
  person: string; people: string; // "patient", "patients"
  job: string; jobs: string; // "appointment", "appointments"
  urgent: string; money: string; leads: string; research: string;
  today: string; // the brief's "today" section: "Today's chairs"
  bots: Record<CoreId, { name: string; role: string }>;
}

export const CASTS: Partial<Record<Industry, Cast>> = Object.fromEntries(
  DATA.trim().split("\n").map((line) => {
    const [key, team, pp, jj, urgent, money, leads, research, today, bots] = line.split("|");
    const [person, people] = pp.split("/"), [job, jobs] = jj.split("/");
    const names = bots.split(",").map((b) => { const [name, role] = b.split(":"); return { name, role }; });
    return [key, { team, person, people: people || person, job, jobs: jobs || job, urgent, money, leads, research, today, bots: Object.fromEntries(CORE_IDS.map((id, i) => [id, names[i]])) as Cast["bots"] }];
  }),
);

export const castOf = (industry: string | null | undefined) => (industry ? CASTS[industry as Industry] ?? null : null);

// The default names the core bots' instructions use for each other.
const DEFAULT_NAMES: Record<CoreId, string> = { inbox: "Penny", research: "Sage", invoices: "Ledger", leads: "Nudge", brief: "Dawn" };

// Swap the default teammates' names for the cast's in any bot's text ("hand it to Ledger" -> "hand it to Rosa").
export function renameTeam(text: string, cast: Cast) {
  return text.replace(/\b(Penny|Sage|Ledger|Nudge|Dawn)\b/g, (n) => {
    const id = (Object.keys(DEFAULT_NAMES) as CoreId[]).find((k) => DEFAULT_NAMES[k] === n)!;
    return cast.bots[id].name;
  });
}

function titleFor(id: CoreId, c: Cast) {
  switch (id) {
    case "inbox": return `Answers ${c.people}, books ${c.jobs} and flags ${c.urgent} the moment it lands`;
    case "research": return `Looks into ${c.research}, and answers the questions you never get to`;
    case "invoices": return `Keeps ${c.money} moving, and chases what's late (politely)`;
    case "leads": return `Follows up ${c.leads} before they go cold`;
    case "brief": return `Your ${c.bots.brief.role.toLowerCase()} every morning: what needs you, ${c.today.toLowerCase()} and what the team did overnight`;
  }
}

function focusFor(id: CoreId, c: Cast, label: string) {
  const words = `You work for a ${label.toLowerCase()} business: the ${c.team}. The people it serves are ${c.people} (one ${c.person}); the work is ${c.jobs}. Use those words, never "customers" or "jobs" when they don't fit.`;
  switch (id) {
    case "inbox": return `${words} Treat ${c.urgent} as urgent: flag it importance 3 and notify the owner right away.`;
    case "research": return `${words} What you look into most: ${c.research}.`;
    case "invoices": return `${words} What you keep moving: ${c.money}.`;
    case "leads": return `${words} Who you follow up: ${c.leads}.`;
    case "brief": return `${words} Call the "Today" section "${c.today}", and use the business's own words throughout.`;
  }
}

// A bot as this industry knows it: the core five get the cast's name, job, title and focus; every bot's
// instructions use the cast's names for its teammates.
export function withCast(def: BotTemplate, industry: string | null | undefined, label: string): BotTemplate {
  const c = castOf(industry);
  if (!c) return def;
  const id = def.id as CoreId;
  if (!CORE_IDS.includes(id)) return { ...def, instructions: renameTeam(def.instructions, c) };
  return { ...def, name: c.bots[id].name, role: c.bots[id].role, title: titleFor(id, c), instructions: `${renameTeam(def.instructions, c)} ${focusFor(id, c, label)}` };
}

// Suggestion chips for a bot's chat, in the industry's words.
export function chipsFor(id: string, industry: string | null | undefined): string[] | null {
  const c = castOf(industry);
  if (!c) return null;
  switch (id) {
    case "inbox": return [`Anything urgent from ${c.people}?`, "Draft replies to what's flagged"];
    case "research": return ["What are competitors charging?", `Look into ${c.research.split(/,| and /)[0].trim()}`];
    case "invoices": return ["Who still owes us?", "Anything overdue this week?"];
    case "leads": return [`Who should I follow up today?`, `Which ${c.people} went quiet?`];
    case "brief": return ["What happened overnight?", "What needs me today?"];
    default: return null;
  }
}
