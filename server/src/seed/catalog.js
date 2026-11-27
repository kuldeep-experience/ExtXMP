// Source data for the seed script. Everything here is fictional demo data.
export const categories = [
  {
    name: 'Real Estate Agents', slug: 'real-estate-agents',
    titles: ["Buyer's Agent", 'Listing Specialist', 'Real Estate Broker'],
    specializations: ['First-Time Buyers', 'Luxury Homes', 'Relocation', 'Investment Properties', 'Condos & Townhomes', 'Short Sales', 'New Construction', 'Senior Downsizing'],
    services: ['Buyer Representation', 'Seller Representation', 'Market Analysis', 'Home Staging Advice', 'Open Houses', 'Relocation Support', 'Investment Property Consulting'],
    qualifications: ['Licensed Real Estate Broker ({state})', 'Certified Residential Specialist (CRS)', "Accredited Buyer's Representative (ABR)", 'Seller Representative Specialist (SRS)', 'Member, National Association of REALTORS®'],
    closers: ['Known for clear communication, honest pricing advice and a data-driven approach to every transaction.', 'Works with first-time buyers, move-up families and investors alike.'],
    positive: [
      'Walked us through every step of buying our first home and never made us feel rushed.',
      'Priced our listing realistically and we had multiple offers within the first week.',
      'Knows the neighborhoods inside out and found options we would never have discovered on our own.',
      'Negotiated hard on our behalf and saved us a meaningful amount on the final price.',
      'Responded to every message the same day, even on weekends, throughout the whole closing.',
      'Handled a complicated relocation for our family with patience and organization.',
    ],
    mixed: [
      'Solid market knowledge and a fair price, though communication slowed down during the closing period.',
      'Got the house sold, but it took longer than the timeline we were originally given.',
      'Professional and knowledgeable, but I expected more help with staging and marketing.',
    ],
  },
  {
    name: 'Financial Advisors', slug: 'financial-advisors',
    titles: ['Certified Financial Planner', 'Wealth Advisor', 'Retirement Planning Specialist'],
    specializations: ['Retirement Planning', 'Wealth Management', 'Tax Planning', 'Estate Planning', 'College Savings', 'Small Business Owners', 'Debt Management', 'Investment Management'],
    services: ['Retirement Planning', 'Portfolio Management', 'Tax-Aware Investing', 'Estate Planning Coordination', 'College Savings Plans', 'Cash Flow & Budget Planning', 'Annual Financial Review'],
    qualifications: ['Certified Financial Planner™ (CFP®)', 'Chartered Financial Consultant (ChFC®)', 'Series 65 Investment Adviser Representative', 'Accredited Investment Fiduciary (AIF®)', 'M.S., Personal Financial Planning'],
    closers: ["Takes a fee-transparent, goals-first approach and builds plans around each client's life stage.", 'Works with families, business owners and pre-retirees on long-term planning.'],
    positive: [
      'Built a retirement plan that finally made sense to us and explained the reasoning behind every recommendation.',
      'Helped us get out of high-interest debt and start investing with a clear, realistic budget.',
      'Transparent about fees and never pushed products that did not fit our goals.',
      'Calmly guided us through a volatile market and kept us focused on our long-term plan.',
      'Coordinated with our accountant to create a tax-aware strategy for our small business.',
      'Made college savings and estate planning feel manageable instead of overwhelming.',
    ],
    mixed: [
      'Knowledgeable and trustworthy, but our review meetings were harder to schedule than I would like.',
      'Good advice overall, although the onboarding paperwork was longer than expected.',
      'Solid portfolio guidance; I would have liked more frequent check-ins between annual reviews.',
    ],
  },
  {
    name: 'Mortgage Professionals', slug: 'mortgage-professionals',
    titles: ['Mortgage Loan Officer', 'Mortgage Broker', 'Home Loan Advisor'],
    specializations: ['First-Time Homebuyers', 'FHA Loans', 'VA Loans', 'Jumbo Loans', 'Refinancing', 'Self-Employed Borrowers', 'Home Equity', 'Down Payment Assistance'],
    services: ['Loan Pre-Approval', 'Purchase Loans', 'Refinancing', 'Rate Comparison', 'Rate Lock Guidance', 'Closing Coordination', 'Down Payment Programs'],
    qualifications: ['NMLS-Licensed Mortgage Loan Originator', 'Certified Mortgage Planning Specialist (CMPS)', 'Certified Residential Mortgage Specialist (CRMS)', 'Approved FHA & VA Lender Network', 'Member, Mortgage Bankers Association'],
    closers: ['Focuses on clear loan comparisons, honest rate guidance and smooth closings.', 'Helps first-time buyers, move-up buyers and refinancing homeowners find the right fit.'],
    positive: [
      'Compared several loan options side by side and helped us pick the one that fit our budget.',
      'Kept our closing on schedule even when the appraisal came in late.',
      'Explained every fee on the loan estimate in plain language, with no surprises at the closing table.',
      'Found a first-time buyer program we did not know existed and it lowered our down payment.',
      'Rate lock advice was spot on and we saved real money over the life of the loan.',
      'Very responsive to our questions and clear about which documents the underwriter needed.',
    ],
    mixed: [
      'Competitive rate, but the document requests came in several separate waves.',
      'Got us to the closing table, though the process felt more stressful than it needed to be.',
      'Helpful and knowledgeable; response times were slower near the end of the process.',
    ],
  },
  {
    name: 'Insurance Professionals', slug: 'insurance-professionals',
    titles: ['Independent Insurance Agent', 'Insurance Advisor', 'Risk Management Consultant'],
    specializations: ['Home Insurance', 'Auto Insurance', 'Life Insurance', 'Business Insurance', 'Umbrella Coverage', 'Flood Insurance', 'Health Insurance', 'Claims Advocacy'],
    services: ['Policy Review', 'Home & Auto Bundling', 'Life Insurance Planning', 'Business Liability Coverage', 'Claims Assistance', 'Annual Coverage Check-ups', 'Quote Comparison'],
    qualifications: ['Licensed Property & Casualty Agent ({state})', 'Chartered Property Casualty Underwriter (CPCU)', 'Certified Insurance Counselor (CIC)', 'Chartered Life Underwriter (CLU®)', 'Independent Insurance Agents Association Member'],
    closers: ['Shops multiple carriers to match coverage to real needs rather than selling the most expensive policy.', 'Provides year-round policy reviews and claims guidance.'],
    positive: [
      'Reviewed all our policies and found coverage gaps we did not know we had, while lowering our premium.',
      'Stayed by our side through a difficult claim and followed up with the carrier until it was resolved.',
      'Explained deductibles and coverage limits clearly so we could choose with confidence.',
      'Bundled our home and auto coverage and saved us a noticeable amount each year.',
      'Helped our small business find the right liability coverage without overselling.',
      'Checks in every year to make sure our coverage still matches our situation.',
    ],
    mixed: [
      'Fair pricing and helpful advice, but the quote process took longer than promised.',
      'Knowledgeable agent, though it took a couple of follow-ups to get our policy documents.',
      'Good coverage options; I wish the renewal reminders had come earlier.',
    ],
  },
  {
    name: 'Legal Professionals', slug: 'legal-professionals',
    titles: ['Attorney at Law', 'Estate Planning Attorney', 'Family & Business Attorney'],
    specializations: ['Estate Planning', 'Family Law', 'Real Estate Law', 'Business Formation', 'Personal Injury', 'Immigration Law', 'Employment Law', 'Contract Review'],
    services: ['Initial Consultation', 'Will & Trust Drafting', 'Contract Review', 'Business Entity Formation', 'Mediation & Settlement', 'Court Representation', 'Document Preparation'],
    qualifications: ['J.D., Doctor of Jurisprudence', 'Admitted to the {state} State Bar', 'Member, American Bar Association', 'Certified Mediator', 'Member, {state} Bar Association'],
    closers: ['Provides clear, practical guidance and keeps clients informed at every stage.', 'Offers initial consultations to help clients understand their options before committing.'],
    positive: [
      'Explained our options in plain English and gave us an honest assessment of the risks.',
      'Prepared our estate documents carefully and made a stressful topic feel straightforward.',
      'Responded quickly to every question and kept us informed at each stage of the case.',
      'Negotiated a fair settlement that avoided a long and costly court process.',
      'Handled our business formation and contracts with great attention to detail.',
      'Patient, respectful and thorough through a very difficult family matter.',
    ],
    mixed: [
      'Knowledgeable and professional, though billing was less clear than I expected.',
      'Good outcome in the end, but the case took longer than we were first told.',
      'Strong legal advice; it was sometimes difficult to reach by phone.',
    ],
  },
  {
    name: 'Home Service Professionals', slug: 'home-service-professionals',
    titles: ['Licensed General Contractor', 'Home Systems Technician', 'Remodeling Specialist'],
    specializations: ['Plumbing', 'Electrical', 'HVAC', 'Roofing', 'Kitchen Remodeling', 'Painting', 'Landscaping', 'Home Inspection'],
    services: ['Free Estimates', 'Emergency Repairs', 'Installation', 'Preventive Maintenance', 'Remodeling', 'Inspections', 'Warranty Service'],
    qualifications: ['Licensed Contractor ({state})', 'EPA Lead-Safe Certified', 'Insured & Bonded', 'Master Trade Certification', 'Manufacturer-Certified Installer'],
    closers: ['Provides written estimates, licensed workmanship and a clean job site on every project.', 'Serves homeowners and landlords with prompt scheduling and honest recommendations.'],
    positive: [
      'Arrived on time, gave a clear written estimate and finished the job exactly as quoted.',
      'Left the work area spotless and walked us through everything that was done.',
      'Diagnosed a problem two other companies had missed and fixed it the same day.',
      'Honest about what needed repair now and what could wait, which saved us money.',
      'The crew was courteous and careful with our home throughout the entire project.',
      'Followed up after the job to make sure everything was working properly.',
    ],
    mixed: [
      'Quality work and a fair price, but the project ran a few days past the original schedule.',
      'The repair was done well, although scheduling the first visit took longer than I hoped.',
      'Good workmanship; communication about arrival times could be better.',
    ],
  },
];

export const positiveClosers = ['Highly recommended.', 'I would not hesitate to work with them again.', 'Easily one of the best professional experiences we have had.', 'We will be referring friends and family.'];
export const mixedClosers = ['Would still consider working with them again.', 'Overall a decent experience with room to improve.', 'Worth considering, with realistic expectations.'];
export const positiveTitles = ['Excellent experience', 'Highly professional', 'Exactly what we needed', 'Knowledgeable and responsive', 'Great communication', 'Would recommend', 'Made it easy', 'Trustworthy and thorough', 'Very good overall', 'Reliable and helpful'];
export const mixedTitles = ['Good, with some room to improve', 'Decent experience', 'Solid but not perfect', 'Mixed feelings'];

export const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Cameron', 'Drew', 'Emily', 'Chris', 'Dana', 'Pat', 'Sam', 'Kim', 'Lee', 'Noah', 'Olivia', 'Liam', 'Sophia', 'Mason', 'Isabella', 'Ethan', 'Mia', 'Lucas', 'Amara', 'Diego', 'Hannah', 'Ravi'];

// name | category index | city | state | optional profileStatus
export const people = `
Sarah Mitchell|0|Austin|TX
David Ortega|0|Phoenix|AZ
Priya Natarajan|0|San Jose|CA
Michael O'Brien|0|Boston|MA
Alicia Washington|0|Atlanta|GA
Tom Brennan|0|Denver|CO
Jennifer Caldwell|1|Charlotte|NC
Robert Chen|1|Seattle|WA
Maria Gonzalez|1|Miami|FL
Daniel Kowalski|1|Chicago|IL
Anita Desai|1|Dallas|TX
James Whitfield|1|Nashville|TN
Kevin Park|2|Los Angeles|CA
Laura Henderson|2|Minneapolis|MN
Omar Haddad|2|Houston|TX
Rachel Goldberg|2|Philadelphia|PA
Steven Marsh|2|Portland|OR
Nina Petrova|2|San Diego|CA
Brian Foster|3|Columbus|OH
Claire Dubois|3|New Orleans|LA
Marcus Johnson|3|Detroit|MI
Elena Rossi|3|Las Vegas|NV
Paul Nguyen|3|Raleigh|NC
Hannah Becker|3|Salt Lake City|UT
Victoria Sinclair|4|New York|NY
Andrew Patel|4|Newark|NJ
Monica Alvarez|4|San Antonio|TX
Gregory Hall|4|Indianapolis|IN
Samantha Reed|4|Tampa|FL
Ethan Cole|4|Kansas City|MO
Carlos Ramirez|5|Orlando|FL
Beth Anderson|5|Madison|WI
Tyrone Banks|5|Baltimore|MD
Lucy Tran|5|Sacramento|CA
Frank Moretti|5|Pittsburgh|PA
Grace Oyelaran|5|Cleveland|OH
Derek Lawson|1|Boise|ID|inactive
Priscilla Nwosu|4|Washington|DC|pending
`.trim().split('\n').map((l) => {
  const [name, cat, city, state, status = 'active'] = l.split('|');
  return { name, cat: Number(cat), city, state, status };
});

// City-center coordinates [lat, lng] for the seeded cities.
export const cityCoords = {
  'Austin|TX': [30.2672, -97.7431], 'Phoenix|AZ': [33.4484, -112.074], 'San Jose|CA': [37.3382, -121.8863], 'Boston|MA': [42.3601, -71.0589],
  'Atlanta|GA': [33.749, -84.388], 'Denver|CO': [39.7392, -104.9903], 'Charlotte|NC': [35.2271, -80.8431], 'Seattle|WA': [47.6062, -122.3321],
  'Miami|FL': [25.7617, -80.1918], 'Chicago|IL': [41.8781, -87.6298], 'Dallas|TX': [32.7767, -96.797], 'Nashville|TN': [36.1627, -86.7816],
  'Los Angeles|CA': [34.0522, -118.2437], 'Minneapolis|MN': [44.9778, -93.265], 'Houston|TX': [29.7604, -95.3698], 'Philadelphia|PA': [39.9526, -75.1652],
  'Portland|OR': [45.5152, -122.6784], 'San Diego|CA': [32.7157, -117.1611], 'Columbus|OH': [39.9612, -82.9988], 'New Orleans|LA': [29.9511, -90.0715],
  'Detroit|MI': [42.3314, -83.0458], 'Las Vegas|NV': [36.1699, -115.1398], 'Raleigh|NC': [35.7796, -78.6382], 'Salt Lake City|UT': [40.7608, -111.891],
  'New York|NY': [40.7128, -74.006], 'Newark|NJ': [40.7357, -74.1724], 'San Antonio|TX': [29.4241, -98.4936], 'Indianapolis|IN': [39.7684, -86.1581],
  'Tampa|FL': [27.9506, -82.4572], 'Kansas City|MO': [39.0997, -94.5786], 'Orlando|FL': [28.5383, -81.3792], 'Madison|WI': [43.0731, -89.4012],
  'Baltimore|MD': [39.2904, -76.6122], 'Sacramento|CA': [38.5816, -121.4944], 'Pittsburgh|PA': [40.4406, -79.9959], 'Cleveland|OH': [41.4993, -81.6944],
  'Boise|ID': [43.615, -116.2023], 'Washington|DC': [38.9072, -77.0369],
};
