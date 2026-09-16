/**
 * Canonical O-level subject list used across WAEC, NECO, NABTEB, and GCE.
 * Each entry has a unique `id` (slug), a human-readable `name`, and the
 * `boards` that offer it — clients can filter by exam type.
 *
 * Sorted alphabetically by name.
 */

const BOARDS = {
  WAEC: 'waec',
  NECO: 'neco',
  NABTEB: 'nabteb',
  GCE: 'gce'
};

const ALL             = ['waec', 'neco', 'nabteb', 'gce'];
const WAEC_NECO_GCE   = ['waec', 'neco', 'gce'];
const WAEC_NECO       = ['waec', 'neco'];

const OLEVEL_SUBJECTS = [
  { id: 'accounting',               name: 'Financial Accounting',                         boards: ALL },
  { id: 'agricultural_science',     name: 'Agricultural Science',                         boards: ALL },
  { id: 'animal_husbandry',         name: 'Animal Husbandry',                             boards: WAEC_NECO_GCE },
  { id: 'arabic',                   name: 'Arabic',                                       boards: WAEC_NECO_GCE },
  { id: 'auto_mechanics',           name: 'Auto Mechanics',                               boards: ['nabteb'] },
  { id: 'basic_electronics',        name: 'Basic Electronics',                            boards: ['nabteb'] },
  { id: 'biology',                  name: 'Biology',                                      boards: ALL },
  { id: 'book_keeping',             name: 'Book Keeping',                                 boards: ['nabteb'] },
  { id: 'building_construction',    name: 'Building Construction',                        boards: ALL },
  { id: 'chemistry',                name: 'Chemistry',                                    boards: ALL },
  { id: 'civic_education',          name: 'Civic Education',                              boards: ALL },
  { id: 'clothing_textiles',        name: 'Clothing & Textiles',                          boards: ALL },
  { id: 'commerce',                 name: 'Commerce',                                     boards: ALL },
  { id: 'computer_studies',         name: 'Computer Studies',                             boards: ALL },
  { id: 'creative_arts',            name: 'Creative Arts',                                boards: WAEC_NECO },
  { id: 'crp',                      name: 'Christian Religious Studies',                  boards: ALL },
  { id: 'data_processing',          name: 'Data Processing',                              boards: WAEC_NECO_GCE },
  { id: 'economics',                name: 'Economics',                                    boards: ALL },
  { id: 'electrical_installation',  name: 'Electrical Installation & Maintenance Works',  boards: ALL },
  { id: 'english_language',         name: 'English Language',                             boards: ALL },
  { id: 'food_nutrition',           name: 'Food & Nutrition',                             boards: ALL },
  { id: 'french',                   name: 'French',                                       boards: WAEC_NECO_GCE },
  { id: 'further_mathematics',      name: 'Further Mathematics',                          boards: WAEC_NECO_GCE },
  { id: 'general_mathematics',      name: 'Mathematics',                                  boards: ALL },
  { id: 'geography',                name: 'Geography',                                    boards: ALL },
  { id: 'german',                   name: 'German',                                       boards: ['waec'] },
  { id: 'government',               name: 'Government',                                   boards: ALL },
  { id: 'graphic_design',           name: 'Graphic Design',                               boards: ['nabteb'] },
  { id: 'hausa',                    name: 'Hausa',                                        boards: WAEC_NECO_GCE },
  { id: 'history',                  name: 'History',                                      boards: ALL },
  { id: 'home_economics',           name: 'Home Economics',                               boards: WAEC_NECO_GCE },
  { id: 'igbo',                     name: 'Igbo',                                         boards: WAEC_NECO_GCE },
  { id: 'ird',                      name: 'Islamic Religious Studies',                    boards: ALL },
  { id: 'literature_english',       name: 'Literature in English',                        boards: ALL },
  { id: 'marketing',                name: 'Marketing',                                    boards: ['nabteb'] },
  { id: 'mathematics_alternative',  name: 'Mathematics (Alternative)',                    boards: ['waec'] },
  { id: 'metal_work',               name: 'Metal Work',                                   boards: ALL },
  { id: 'music',                    name: 'Music',                                        boards: WAEC_NECO_GCE },
  { id: 'office_practice',          name: 'Office Practice',                              boards: ALL },
  { id: 'painting_decorating',      name: 'Painting & Decorating',                        boards: ['nabteb'] },
  { id: 'physical_education',       name: 'Physical Education',                           boards: WAEC_NECO },
  { id: 'physics',                  name: 'Physics',                                      boards: ALL },
  { id: 'plumbing',                 name: 'Plumbing & Pipe Fitting',                      boards: ['nabteb'] },
  { id: 'printing_craft_practice',  name: 'Printing Craft Practice',                      boards: ['nabteb'] },
  { id: 'social_studies',           name: 'Social Studies',                               boards: WAEC_NECO },
  { id: 'store_keeping',            name: 'Store Keeping',                                boards: ['nabteb'] },
  { id: 'technical_drawing',        name: 'Technical Drawing',                            boards: ALL },
  { id: 'tourism',                  name: 'Tourism',                                      boards: WAEC_NECO_GCE },
  { id: 'typewriting',              name: 'Typewriting',                                  boards: ['nabteb'] },
  { id: 'visual_art',               name: 'Visual Art',                                   boards: ALL },
  { id: 'welding_fabrication',      name: 'Welding & Fabrication',                        boards: ['nabteb'] },
  { id: 'woodwork',                 name: 'Wood Work',                                    boards: ALL },
  { id: 'yoruba',                   name: 'Yoruba',                                       boards: WAEC_NECO_GCE }
];

module.exports = { OLEVEL_SUBJECTS, BOARDS };
