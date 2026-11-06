// Knowledge base for the rule-based triage engine.
// Medicines are listed by generic name only - no doses. Users are told to follow the pack label or a pharmacist.

// Red flags: any match means "go to emergency care now". These are checked first and can never be downgraded.
const RED_FLAGS = [
  { id: 'chest_pain', patterns: [/chest (pain|pressure|tightness|heaviness)/, /pain in (my |the )?chest/, /crushing pain/, /pain (spreading|radiating) to (my |the )?(left )?(arm|jaw)/],
    title: 'Possible heart problem', message: 'Chest pain or pressure, especially spreading to the arm, jaw or back, can be a heart attack. Call emergency services now. Do not drive yourself.' },
  { id: 'breathing', patterns: [/(difficulty|trouble|hard|struggling to) breath/, /can'?t breathe/, /cannot breathe/, /short(ness)? of breath/, /breathless/, /gasping/, /choking/, /lips? (turning )?(blue|bluish)/],
    title: 'Breathing difficulty', message: 'Serious trouble breathing needs emergency care immediately.' },
  { id: 'stroke', patterns: [/face (is )?droop/, /slurred speech/, /(sudden )?(weakness|numbness) (in|on) (one|left|right) side/, /one side of (my |the )?(face|body)/, /can'?t (move|lift) (my )?(arm|leg)/, /sudden (vision loss|confusion|trouble speaking)/],
    title: 'Possible stroke (F.A.S.T.)', message: 'Face drooping, arm weakness or slurred speech can mean a stroke. Note the time symptoms started and call emergency services now.' },
  { id: 'unconscious', patterns: [/unconscious/, /unresponsive/, /passed out/, /fainted/, /not waking up/, /collapsed/],
    title: 'Loss of consciousness', message: 'Fainting or unresponsiveness needs urgent medical assessment. If the person is not breathing normally, start CPR and call emergency services.' },
  { id: 'seizure', patterns: [/seizure/, /convulsion/, /\bfits?\b/, /shaking uncontrollably/],
    title: 'Seizure', message: 'Keep the person safe from injury, do not put anything in their mouth, and call emergency services, especially if it lasts over 5 minutes or is their first seizure.' },
  { id: 'bleeding', patterns: [/bleeding (heavily|a lot|won'?t stop|will not stop|nonstop)/, /severe bleeding/, /(vomit(ing)?|throwing up|cough(ing)?( up)?) blood/, /blood in (my )?vomit/, /black,? tarry stool/],
    title: 'Serious bleeding', message: 'Heavy bleeding or blood in vomit or cough needs emergency care. Apply firm pressure to any external wound.' },
  { id: 'anaphylaxis', patterns: [/(swollen|swelling of|swelling in) (my |the )?(lips?|tongue|throat|face)/, /throat (is )?(closing|tight)/, /anaphyla/],
    title: 'Possible severe allergic reaction', message: 'Swelling of the lips, tongue or throat can block breathing. Use an adrenaline auto-injector if you have one and call emergency services.' },
  { id: 'head', patterns: [/worst headache/, /sudden severe headache/, /thunderclap/, /stiff neck.*fever|fever.*stiff neck/, /head injury.*(vomit|confus|sleepy)|(vomit|confus|sleepy).*head injury/],
    title: 'Dangerous headache pattern', message: 'A sudden, severe headache, a headache with fever and stiff neck, or a head injury with vomiting or confusion needs emergency assessment.' },
  { id: 'poison', patterns: [/poison/, /overdose/, /swallowed (bleach|chemical|pills|battery|kerosene)/, /took too many/],
    title: 'Possible poisoning', message: 'Call emergency services now. Do not induce vomiting unless a medical professional tells you to. Keep the container to show the doctors.' },
  { id: 'snakebite', patterns: [/snake ?bite/, /bitten by (a )?snake/],
    title: 'Snakebite', message: 'Keep the person calm and still, keep the bitten limb immobile and below heart level, remove rings or tight items, and go to the nearest hospital immediately. Do not cut, suck or tie the wound.' },
  { id: 'infant_fever', patterns: [/(baby|infant|newborn).*(fever|temperature)|(fever|temperature).*(baby|infant|newborn)/],
    title: 'Fever in a baby', message: 'Any fever in a baby under 3 months needs a doctor urgently. Older babies who are very drowsy, not feeding or have a rash that does not fade should also be seen urgently.' },
  { id: 'pregnancy', patterns: [/pregnan.*(bleeding|severe (abdominal |stomach )?pain)|(bleeding|severe (abdominal |stomach )?pain).*pregnan/],
    title: 'Pregnancy warning sign', message: 'Bleeding or severe pain during pregnancy needs urgent medical care.' },
  { id: 'abdomen', patterns: [/severe (abdominal|stomach|belly) pain/, /(abdominal|stomach|belly) pain.*(rigid|hard|unbearable)/],
    title: 'Severe abdominal pain', message: 'Severe or worsening abdominal pain can be appendicitis or another emergency. Seek medical care now.' },
];

// Mental-health crisis is handled separately with supportive wording and helplines.
const CRISIS_PATTERNS = [/suicid/, /kill myself/, /end my life/, /want to die/, /self[- ]?harm/, /hurt myself/];

// Patterns that push severity to "urgent" (see a doctor within 24 hours).
const URGENT_RULES = [
  { patterns: [/(10[3-9]|39\.[5-9]|4[0-2])(\.\d)? ?(°|deg|degrees)? ?(f|c)?\b.*fever|very high fever|high fever/], reason: 'High fever' },
  { patterns: [/not (urinat|peeing)|very little urine|dark urine.*(dizzy|weak)/, /severely dehydrated/], reason: 'Signs of dehydration' },
  { patterns: [/blood in (my )?(urine|stool|poop)/], reason: 'Blood in urine or stool' },
  { patterns: [/(burning|painful) urin.*(fever|back pain)|(fever|back pain).*(burning|painful) urin/], reason: 'Urinary symptoms with fever or back pain (possible kidney infection)' },
  { patterns: [/rash.*(not fad|doesn'?t fade|purple|spreading fast)/], reason: 'Unusual rash' },
  { patterns: [/(deep|large|gaping) (cut|wound)|(cut|wound) (is )?(deep|gaping)/, /animal bite|dog bite|bitten by (a )?(dog|cat|monkey)/], reason: 'Wound that may need stitches, a tetanus shot or rabies vaccine' },
  { patterns: [/burn.*(large|blister.*(face|hands?|genital)|chemical|electrical)/], reason: 'Burn that needs medical assessment' },
];

// Conditions. `keywords` are matched as whole phrases in the lowercased input.
const CONDITIONS = [
  {
    id: 'fever', name: 'Fever / Possible Infection', keywords: ['fever', 'feverish', 'temperature', 'chills', 'shivering'],
    selfCare: ['Rest and drink plenty of fluids (water, ORS, soups).', 'Wear light clothing and keep the room cool.', 'Check your temperature every 4–6 hours and note it down.'],
    otc: ['Paracetamol (acetaminophen) to bring the fever down'],
    seeDoctorIf: ['Fever lasts more than 3 days', 'Temperature is 39.5 °C (103 °F) or higher', 'You develop a rash, severe headache, stiff neck or confusion'],
    specialist: 'General Physician',
  },
  {
    id: 'dengue', name: 'Possible Dengue / Chikungunya (fever with body or joint pain)', keywords: ['joint pain', 'body ache', 'body pain', 'pain behind eyes', 'pain behind my eyes', 'rash', 'platelet', 'dengue', 'chikungunya'],
    requiresAny: ['fever', 'feverish', 'temperature'], minMatches: 1,
    selfCare: ['Get a blood test (NS1 / CBC with platelet count) to confirm.', 'Drink plenty of fluids, ORS, coconut water.', 'Rest and use mosquito protection to avoid spreading it.'],
    otc: ['Paracetamol only for fever and pain'],
    avoid: ['Avoid ibuprofen, aspirin, diclofenac and other NSAIDs - they can increase bleeding risk in dengue'],
    avoidGroups: ['nsaid'],
    seeDoctorIf: ['Bleeding gums or nose, vomiting, severe stomach pain, extreme tiredness', 'Fever drops but you feel worse (this can be the critical phase)'],
    specialist: 'General Physician',
  },
  {
    id: 'headache', name: 'Tension Headache', keywords: ['headache', 'head ache', 'head pain', 'head hurts', 'pressure in head'],
    selfCare: ['Rest in a quiet, dim room.', 'Drink water - dehydration is a common trigger.', 'Take screen breaks and relax your neck and shoulders.'],
    otc: ['Paracetamol', 'Ibuprofen (with food)'],
    seeDoctorIf: ['Headaches are frequent or getting worse', 'You need pain relievers more than 2–3 days a week', 'Headache follows a head injury'],
    specialist: 'General Physician / Neurologist',
  },
  {
    id: 'migraine', name: 'Migraine', keywords: ['migraine', 'throbbing headache', 'one sided headache', 'sensitive to light', 'light sensitivity', 'aura', 'flashing lights'],
    selfCare: ['Lie down in a dark, quiet room.', 'Apply a cold pack to your forehead.', 'Keep a diary of triggers (sleep, food, stress, screens).'],
    otc: ['Paracetamol', 'Ibuprofen'],
    seeDoctorIf: ['Migraines happen several times a month', 'Your usual pattern changes suddenly'],
    specialist: 'Neurologist',
  },
  {
    id: 'cold', name: 'Common Cold', keywords: ['runny nose', 'stuffy nose', 'blocked nose', 'sneezing', 'sneeze', 'congestion', 'cold'],
    selfCare: ['Steam inhalation 2–3 times a day.', 'Saline nasal spray or drops.', 'Warm fluids and rest - most colds clear in 7–10 days.'],
    otc: ['Saline nasal spray', 'Cetirizine or levocetirizine for sneezing and runny nose'],
    seeDoctorIf: ['Symptoms last more than 10 days', 'High fever, ear pain or facial pain develop'],
    specialist: 'General Physician',
  },
  {
    id: 'flu', name: 'Flu (Influenza) / Viral Illness', keywords: ['flu', 'body ache', 'body pain', 'muscle ache', 'chills', 'weakness', 'tired'],
    minMatches: 2,
    selfCare: ['Rest at home and avoid close contact with others.', 'Drink plenty of fluids.', 'Cover coughs and wash hands often.'],
    otc: ['Paracetamol for fever and aches'],
    seeDoctorIf: ['You are over 65, pregnant, or have diabetes, asthma or heart disease', 'Breathing becomes difficult', 'Symptoms improve then return worse'],
    specialist: 'General Physician',
  },
  {
    id: 'cough', name: 'Cough / Respiratory Irritation', keywords: ['cough', 'coughing', 'dry cough', 'wet cough', 'phlegm', 'mucus', 'chest congestion'],
    selfCare: ['Warm water with honey (not for children under 1 year).', 'Steam inhalation.', 'Avoid smoke, dust and cold drinks.'],
    otc: ['Lozenges', 'Honey-based cough syrup'],
    seeDoctorIf: ['Cough lasts more than 3 weeks', 'You cough up blood or have chest pain', 'You are wheezing or short of breath'],
    specialist: 'General Physician / Pulmonologist',
  },
  {
    id: 'sore_throat', name: 'Sore Throat (Pharyngitis)', keywords: ['sore throat', 'throat pain', 'scratchy throat', 'painful swallowing', 'pain when swallowing', 'throat infection'],
    selfCare: ['Gargle with warm salt water several times a day.', 'Warm tea with honey.', 'Rest your voice.'],
    otc: ['Throat lozenges', 'Paracetamol for pain'],
    seeDoctorIf: ['You can’t swallow liquids or have trouble opening your mouth', 'White patches on tonsils with fever', 'Lasts more than a week'],
    specialist: 'ENT Specialist',
  },
  {
    id: 'nausea', name: 'Nausea / Indigestion', keywords: ['nausea', 'nauseous', 'queasy', 'feel sick', 'want to vomit'],
    selfCare: ['Sip clear fluids slowly (water, ORS, clear soup).', 'Eat small bland meals - bananas, rice, toast, curd rice.', 'Avoid oily, spicy food and strong smells.'],
    otc: ['Oral rehydration salts (ORS)'],
    seeDoctorIf: ['Nausea lasts more than 2 days', 'You can’t keep any fluids down', 'There is severe abdominal pain'],
    specialist: 'General Physician / Gastroenterologist',
  },
  {
    id: 'vomiting', name: 'Gastroenteritis / Food Poisoning', keywords: ['vomit', 'vomiting', 'throwing up', 'threw up', 'food poisoning', 'stomach bug'],
    selfCare: ['Take small, frequent sips of ORS to prevent dehydration.', 'Pause solid food until vomiting settles, then start with bland food.', 'Wash hands thoroughly.'],
    otc: ['Oral rehydration salts (ORS)'],
    seeDoctorIf: ['Vomiting lasts more than 24 hours (12 hours for children)', 'Signs of dehydration: very little urine, dizziness, dry mouth', 'Blood in vomit'],
    specialist: 'General Physician',
  },
  {
    id: 'diarrhea', name: 'Diarrhoea / Loose Motions', keywords: ['diarrhea', 'diarrhoea', 'loose motion', 'loose motions', 'loose stools', 'watery stool', 'running stomach'],
    selfCare: ['Drink ORS after every loose motion.', 'Eat bland food - rice, curd, banana, khichdi.', 'Avoid milk, oily and spicy food for a few days.'],
    otc: ['Oral rehydration salts (ORS)', 'Zinc supplements (especially for children, as advised by a doctor)'],
    seeDoctorIf: ['Lasts more than 2 days', 'Blood or mucus in stool, or high fever', 'Signs of dehydration'],
    specialist: 'General Physician / Gastroenterologist',
  },
  {
    id: 'constipation', name: 'Constipation', keywords: ['constipation', 'constipated', 'hard stool', 'can’t pass stool', "can't pass stool", 'no bowel movement'],
    selfCare: ['Increase fibre - fruits, vegetables, whole grains.', 'Drink more water.', 'Stay active - a daily walk helps.'],
    otc: ['Isabgol (psyllium husk)', 'Lactulose syrup'],
    seeDoctorIf: ['Lasts more than 1 week', 'Severe pain, blood in stool or unexplained weight loss'],
    specialist: 'Gastroenterologist',
  },
  {
    id: 'acidity', name: 'Acidity / Heartburn / Gas', keywords: ['acidity', 'heartburn', 'acid reflux', 'burning in chest after eating', 'indigestion', 'gas', 'bloating', 'bloated', 'burping', 'sour taste'],
    selfCare: ['Eat smaller meals and avoid lying down for 2–3 hours after eating.', 'Cut down on spicy, oily food, tea, coffee and alcohol.', 'Raise the head of your bed slightly.'],
    otc: ['Antacids', 'Famotidine'],
    seeDoctorIf: ['Symptoms happen more than twice a week', 'Difficulty swallowing, weight loss or black stools', 'Chest pain with sweating or breathlessness (could be the heart - seek emergency care)'],
    specialist: 'Gastroenterologist',
  },
  {
    id: 'stomach_pain', name: 'Stomach Ache', keywords: ['stomach ache', 'stomach pain', 'tummy ache', 'abdominal pain', 'belly pain', 'cramps in stomach'],
    selfCare: ['Rest and sip warm water.', 'Use a warm compress on your belly.', 'Eat light, bland food.'],
    otc: ['Antacids if it feels like acidity'],
    seeDoctorIf: ['Pain is severe, constant, or in the lower right side', 'Pain comes with fever or vomiting', 'Lasts more than 24 hours'],
    specialist: 'General Physician / Gastroenterologist',
  },
  {
    id: 'allergy', name: 'Allergic Reaction (mild)', keywords: ['allergy', 'allergic', 'itchy eyes', 'watery eyes', 'hives', 'itching', 'itchy'],
    selfCare: ['Identify and avoid the trigger (dust, pollen, food, new product).', 'Cool compress on itchy skin.', 'Rinse eyes with clean water.'],
    otc: ['Cetirizine', 'Loratadine', 'Calamine lotion for itchy skin'],
    seeDoctorIf: ['Swelling of lips, tongue or throat, or trouble breathing (EMERGENCY)', 'Hives spread over the body', 'Reactions keep happening'],
    specialist: 'Allergist / Dermatologist',
  },
  {
    id: 'rash', name: 'Skin Rash', keywords: ['rash', 'red spots', 'skin irritation', 'red patches', 'bumps on skin', 'eczema'],
    selfCare: ['Keep the area clean and dry.', 'Avoid scratching and harsh soaps.', 'Wear loose cotton clothing.'],
    otc: ['Calamine lotion', 'Fragrance-free moisturiser', 'Cetirizine for itching'],
    seeDoctorIf: ['Rash with fever', 'Rash that blisters, spreads fast, or does not fade when pressed with a glass', 'Rash near the eyes or genitals'],
    specialist: 'Dermatologist',
  },
  {
    id: 'cut', name: 'Minor Cut / Wound', keywords: ['cut', 'scrape', 'graze', 'wound', 'bruise', 'abrasion'],
    selfCare: ['Wash hands, then rinse the wound under clean running water.', 'Apply gentle pressure with a clean cloth to stop bleeding.', 'Cover with a sterile bandage and change it daily.'],
    otc: ['Antiseptic solution', 'Antibiotic ointment', 'Adhesive bandages'],
    seeDoctorIf: ['Bleeding doesn’t stop after 10 minutes of pressure', 'Wound is deep, gaping or from a dirty/rusty object (you may need a tetanus shot)', 'Signs of infection: spreading redness, pus, warmth, fever'],
    specialist: 'General Physician',
  },
  {
    id: 'burn', name: 'Minor Burn', keywords: ['burn', 'burnt', 'burned', 'scald', 'scalded'],
    selfCare: ['Cool under running tap water for 20 minutes.', 'Remove rings or tight items near the burn.', 'Cover loosely with cling film or a clean non-fluffy dressing.', 'Do NOT apply ice, butter, toothpaste or oil.'],
    otc: ['Paracetamol for pain'],
    seeDoctorIf: ['Burn is larger than your palm', 'Burn is on the face, hands, feet, joints or genitals', 'It is a chemical or electrical burn, or the skin looks white or charred'],
    specialist: 'General Physician / Burns unit',
  },
  {
    id: 'sprain', name: 'Sprain / Strain', keywords: ['sprain', 'sprained', 'twisted ankle', 'twisted my ankle', 'swollen ankle', 'swollen joint', 'pulled muscle', 'strain'],
    selfCare: ['R.I.C.E.: Rest, Ice (wrapped, 15–20 min), Compression bandage, Elevation.', 'Avoid putting weight on it for 24–48 hours.'],
    otc: ['Paracetamol', 'Ibuprofen', 'Topical pain-relief gel'],
    seeDoctorIf: ['You can’t bear weight or move the joint', 'There is a visible deformity or numbness', 'Swelling doesn’t improve after 3 days'],
    specialist: 'Orthopaedic',
  },
  {
    id: 'back_pain', name: 'Back Pain', keywords: ['back pain', 'lower back pain', 'backache', 'back ache', 'stiff back'],
    selfCare: ['Stay gently active - long bed rest slows recovery.', 'Heat pack or warm shower.', 'Check your posture and chair at work.'],
    otc: ['Paracetamol', 'Ibuprofen', 'Topical pain-relief gel'],
    seeDoctorIf: ['Numbness or weakness in the legs', 'Loss of bladder or bowel control (EMERGENCY)', 'Pain after a fall or lasting more than 6 weeks'],
    specialist: 'Orthopaedic / Physiotherapist',
  },
  {
    id: 'muscle_pain', name: 'Muscle Pain', keywords: ['muscle pain', 'sore muscles', 'muscle cramp', 'cramps', 'leg cramps', 'neck pain', 'shoulder pain'],
    selfCare: ['Gentle stretching and rest.', 'Warm compress.', 'Stay hydrated - cramps can be from low fluids or salts.'],
    otc: ['Topical pain-relief gel', 'Paracetamol'],
    seeDoctorIf: ['Severe pain after starting a new medicine', 'Pain with redness, swelling and warmth in the calf'],
    specialist: 'General Physician / Physiotherapist',
  },
  {
    id: 'toothache', name: 'Toothache', keywords: ['toothache', 'tooth ache', 'tooth pain', 'gum pain', 'swollen gum', 'sensitive teeth'],
    selfCare: ['Rinse with warm salt water.', 'Floss gently to remove trapped food.', 'Cold compress on the cheek for swelling.'],
    otc: ['Paracetamol', 'Ibuprofen', 'Clove oil (applied sparingly)'],
    seeDoctorIf: ['Pain lasts more than 2 days', 'Facial swelling, fever or a bad taste in the mouth (possible abscess)'],
    specialist: 'Dentist',
  },
  {
    id: 'ear_pain', name: 'Ear Pain', keywords: ['ear pain', 'earache', 'ear ache', 'blocked ear', 'ear infection', 'ringing in ear'],
    selfCare: ['Warm compress over the ear.', 'Keep the ear dry - no cotton buds inside.', 'Chewing or yawning can help with blocked ears.'],
    otc: ['Paracetamol for pain'],
    seeDoctorIf: ['Discharge from the ear', 'Hearing loss or dizziness', 'Pain lasts more than 2–3 days'],
    specialist: 'ENT Specialist',
  },
  {
    id: 'eye', name: 'Eye Irritation / Conjunctivitis', keywords: ['red eye', 'red eyes', 'pink eye', 'eye irritation', 'eye discharge', 'sticky eyes', 'conjunctivitis', 'eye pain'],
    selfCare: ['Don’t rub your eyes; wash hands often.', 'Clean discharge with cooled boiled water and clean cotton.', 'Don’t share towels; avoid contact lenses until better.'],
    otc: ['Lubricating eye drops (artificial tears)'],
    seeDoctorIf: ['Eye pain, blurred vision or sensitivity to light', 'Injury or chemical in the eye (rinse for 15 minutes first)', 'No improvement in 3 days'],
    specialist: 'Ophthalmologist',
  },
  {
    id: 'insomnia', name: 'Sleep Trouble (Insomnia)', keywords: ['insomnia', "can't sleep", 'cant sleep', 'trouble sleeping', 'not sleeping', 'sleepless'],
    selfCare: ['Keep a fixed sleep and wake time.', 'No screens 1 hour before bed; keep the room dark and cool.', 'Avoid caffeine after 2 pm.'],
    otc: [],
    seeDoctorIf: ['Sleep problems last more than a month', 'You snore loudly or stop breathing in your sleep', 'Low mood or anxiety is affecting sleep'],
    specialist: 'General Physician / Sleep specialist',
  },
  {
    id: 'anxiety', name: 'Stress / Anxiety', keywords: ['anxiety', 'anxious', 'stress', 'stressed', 'panic', 'panic attack', 'worried', 'overwhelmed', 'nervous'],
    selfCare: ['Try slow breathing: in for 4 seconds, hold 4, out for 6.', 'Take a short walk and talk to someone you trust.', 'Limit caffeine and keep regular sleep.'],
    otc: [],
    seeDoctorIf: ['Anxiety is affecting daily life, work or study', 'Panic attacks keep happening', 'You feel hopeless'],
    specialist: 'Psychologist / Psychiatrist',
  },
  {
    id: 'dizziness', name: 'Dizziness', keywords: ['dizzy', 'dizziness', 'lightheaded', 'light headed', 'vertigo', 'room spinning'],
    selfCare: ['Sit or lie down straight away to avoid falling.', 'Drink water and have a light snack.', 'Stand up slowly from sitting or lying.'],
    otc: ['Oral rehydration salts (ORS) if you may be dehydrated'],
    seeDoctorIf: ['Dizziness with chest pain, fainting or weakness on one side (EMERGENCY)', 'It keeps coming back'],
    specialist: 'General Physician / ENT / Neurologist',
  },
  {
    id: 'fatigue', name: 'Fatigue / Tiredness', keywords: ['fatigue', 'tired', 'exhausted', 'no energy', 'low energy', 'weak', 'weakness'],
    minMatches: 1,
    selfCare: ['Aim for 7–9 hours of sleep.', 'Eat balanced meals and drink enough water.', 'Light daily exercise helps energy levels.'],
    otc: [],
    seeDoctorIf: ['Tiredness lasts more than 2 weeks', 'Weight loss, pale skin, breathlessness or excessive thirst', 'A blood test may check for anaemia, thyroid or diabetes'],
    specialist: 'General Physician',
  },
  {
    id: 'uti', name: 'Possible Urinary Tract Infection', keywords: ['burning urination', 'burning while urinating', 'burning when i pee', 'painful urination', 'frequent urination', 'urine infection', 'uti', 'cloudy urine'],
    selfCare: ['Drink plenty of water.', 'Don’t hold in urine.'],
    otc: [],
    seeDoctorIf: ['UTIs usually need a urine test and prescribed antibiotics - see a doctor', 'Fever, back pain or vomiting (possible kidney infection)'],
    specialist: 'General Physician / Urologist',
  },
  {
    id: 'period_pain', name: 'Menstrual Cramps', keywords: ['period pain', 'period cramps', 'menstrual cramps', 'menstrual pain', 'periods pain', 'dysmenorrhea'],
    selfCare: ['Hot water bag on the lower belly.', 'Gentle exercise or yoga.', 'Stay hydrated.'],
    otc: ['Ibuprofen', 'Mefenamic acid', 'Paracetamol'],
    seeDoctorIf: ['Pain stops you from daily activities', 'Very heavy bleeding (soaking a pad every hour)', 'Pain is new or getting worse each month'],
    specialist: 'Gynaecologist',
  },
  {
    id: 'heat', name: 'Heat Exhaustion / Dehydration', keywords: ['heat exhaustion', 'sunstroke', 'dehydrated', 'dehydration', 'very thirsty', 'dry mouth', 'too much sun'],
    selfCare: ['Move to a cool, shaded place.', 'Drink ORS or water in sips.', 'Loosen clothing and cool the skin with wet cloths.'],
    otc: ['Oral rehydration salts (ORS)'],
    seeDoctorIf: ['Confusion, fainting or no sweating with hot skin (heat stroke - EMERGENCY)', 'Symptoms don’t improve in 1 hour'],
    specialist: 'General Physician',
  },
  {
    id: 'insect_bite', name: 'Insect Bite / Sting', keywords: ['insect bite', 'mosquito bite', 'bee sting', 'wasp sting', 'sting', 'ant bite', 'bug bite'],
    selfCare: ['Remove a sting by scraping sideways (don’t squeeze).', 'Wash with soap and water; apply a cold pack.'],
    otc: ['Calamine lotion', 'Cetirizine for itching'],
    seeDoctorIf: ['Swelling of the face or throat, or trouble breathing (EMERGENCY)', 'Signs of infection after a few days'],
    specialist: 'General Physician',
  },
  {
    id: 'mouth_ulcer', name: 'Mouth Ulcer', keywords: ['mouth ulcer', 'mouth ulcers', 'canker sore', 'ulcer in mouth', 'mouth sore'],
    selfCare: ['Rinse with warm salt water.', 'Avoid spicy and very hot food.', 'Use a soft toothbrush.'],
    otc: ['Oral gel for mouth ulcers'],
    seeDoctorIf: ['Ulcer lasts more than 2 weeks', 'Ulcers keep coming back or are very large'],
    specialist: 'Dentist / General Physician',
  },
];

// Short list used for the quick-add chips in the UI.
const COMMON_SYMPTOMS = [
  'fever', 'headache', 'cough', 'sore throat', 'runny nose', 'body ache', 'nausea', 'vomiting', 'diarrhea',
  'stomach pain', 'acidity', 'rash', 'itching', 'dizziness', 'fatigue', 'back pain', 'joint pain', 'toothache',
  'ear pain', 'red eyes', 'burning urination', 'period cramps', 'cut', 'burn', 'sprain', 'anxiety', "can't sleep",
];

// Medicine classes used for allergy cross-checks.
const DRUG_GROUPS = {
  nsaid: ['ibuprofen', 'aspirin', 'diclofenac', 'naproxen', 'mefenamic acid', 'nsaid'],
  paracetamol: ['paracetamol', 'acetaminophen'],
  antihistamine: ['cetirizine', 'levocetirizine', 'loratadine'],
};

module.exports = { RED_FLAGS, CRISIS_PATTERNS, URGENT_RULES, CONDITIONS, COMMON_SYMPTOMS, DRUG_GROUPS };
