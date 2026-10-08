// Curated, reviewed verse library + chapter metadata. Pure: no DOM, no node:*.
// The model only emits [[BG c.v]] markers; the app renders verse text from here.
// Translations are faithful renderings written for this app, not copied from a copyrighted edition.

// Standard 700-verse numbering. Chapter 13 has 34 here; some editions number 35 (prefixing Arjuna's question).
const COUNTS = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 34, 27, 20, 24, 28, 78];
const NAMES = [
  'Arjuna-viṣāda Yoga',
  'Sāṅkhya Yoga',
  'Karma Yoga',
  'Jñāna-karma-sannyāsa Yoga',
  'Karma-sannyāsa Yoga',
  'Dhyāna Yoga',
  'Jñāna-vijñāna Yoga',
  'Akṣara-brahma Yoga',
  'Rāja-vidyā-rāja-guhya Yoga',
  'Vibhūti Yoga',
  'Viśvarūpa-darśana Yoga',
  'Bhakti Yoga',
  'Kṣetra-kṣetrajña-vibhāga Yoga',
  'Guṇa-traya-vibhāga Yoga',
  'Puruṣottama Yoga',
  'Daivāsura-sampad-vibhāga Yoga',
  'Śraddhā-traya-vibhāga Yoga',
  'Mokṣa-sannyāsa Yoga',
];

/** @type {{ n:number, name:string, verses:number }[]} */
export const CHAPTERS = Object.freeze(
  COUNTS.map((verses, i) => Object.freeze({ n: i + 1, name: NAMES[i], verses })),
);

const RAW = [
  ['2.14', 'Impermanence and endurance',
    "mātrā-sparśās tu kaunteya śītoṣṇa-sukha-duḥkha-dāḥ / āgamāpāyino 'nityās tāṁs titikṣasva bhārata",
    'O son of Kunti, the contact of the senses with their objects brings cold and heat, pleasure and pain. These come and go; they are not permanent. Bear them patiently, O Bharata.',
    'हे कुन्तीपुत्र, इन्द्रियों और विषयों के संयोग से सर्दी-गर्मी और सुख-दुःख उत्पन्न होते हैं। ये आते-जाते रहते हैं और अनित्य हैं; हे भारत, इन्हें धैर्य से सहन करो।'],
  ['2.20', 'The eternal Self; grief and loss',
    "na jāyate mriyate vā kadācin nāyaṁ bhūtvā bhavitā vā na bhūyaḥ / ajo nityaḥ śāśvato 'yaṁ purāṇo na hanyate hanyamāne śarīre",
    'The Self is never born and never dies. It did not come into being, and it will not cease to be. Unborn, eternal, everlasting and ancient, it is not destroyed when the body is destroyed.',
    'आत्मा न कभी जन्म लेती है, न कभी मरती है; न यह उत्पन्न होकर फिर मिटने वाली है। यह अजन्मा, नित्य, शाश्वत और पुरातन है; शरीर के नष्ट होने पर भी यह नष्ट नहीं होती।'],
  ['2.47', 'Action without attachment to results',
    "karmaṇy evādhikāras te mā phaleṣu kadācana / mā karma-phala-hetur bhūr mā te saṅgo 'stv akarmaṇi",
    'Your right is to your actions alone, never to their fruits. Do not let the fruit of action be your motive, and do not be attached to inaction.',
    'तुम्हारा अधिकार केवल कर्म करने में है, उसके फलों में कभी नहीं। कर्मफल को अपना उद्देश्य मत बनाओ, और कर्म न करने में भी तुम्हारी आसक्ति न हो।'],
  ['2.48', 'Equanimity in success and failure',
    'yoga-sthaḥ kuru karmāṇi saṅgaṁ tyaktvā dhanañjaya / siddhy-asiddhyoḥ samo bhūtvā samatvaṁ yoga ucyate',
    'Steady in yoga, do your work, O Dhananjaya, letting go of attachment and staying even-minded in success and failure. This evenness of mind is called yoga.',
    'हे धनंजय, योग में स्थित होकर, आसक्ति छोड़कर और सफलता-असफलता में समान भाव रखकर कर्म करो। यही समत्व योग कहलाता है।'],
  ['2.50', 'Skill in action',
    'buddhi-yukto jahātīha ubhe sukṛta-duṣkṛte / tasmād yogāya yujyasva yogaḥ karmasu kauśalam',
    'One whose understanding is steady lets go of both good and bad deeds even here in this life. So devote yourself to yoga; yoga is skill in action.',
    'समबुद्धि से युक्त व्यक्ति इसी जीवन में पुण्य और पाप दोनों से मुक्त हो जाता है। इसलिए योग में लग जाओ; कर्मों में कुशलता ही योग है।'],
  ['2.56', 'Steadiness of mind',
    'duḥkheṣv anudvigna-manāḥ sukheṣu vigata-spṛhaḥ / vīta-rāga-bhaya-krodhaḥ sthita-dhīr munir ucyate',
    'One whose mind is not shaken by sorrow, who does not crave pleasure, and who is free from attachment, fear and anger, is called a sage of steady wisdom.',
    'जिसका मन दुःख में विचलित नहीं होता, जिसे सुख की लालसा नहीं है, और जो राग, भय और क्रोध से मुक्त है, वह स्थिर बुद्धि वाला मुनि कहलाता है।'],
  ['2.62', 'How anger arises',
    "dhyāyato viṣayān puṁsaḥ saṅgas teṣūpajāyate / saṅgāt sañjāyate kāmaḥ kāmāt krodho 'bhijāyate",
    'When a person dwells on the objects of the senses, attachment to them arises. From attachment comes desire, and from desire, anger is born.',
    'विषयों का चिंतन करने वाले मनुष्य की उनमें आसक्ति हो जाती है। आसक्ति से कामना उत्पन्न होती है, और कामना से क्रोध जन्म लेता है।'],
  ['3.19', 'Doing your work without attachment',
    'tasmād asaktaḥ satataṁ kāryaṁ karma samācara / asakto hy ācaran karma param āpnoti pūruṣaḥ',
    'Therefore, without attachment, always do the work that needs to be done; for by working without attachment, a person reaches the highest.',
    'इसलिए आसक्ति रहित होकर सदा अपने कर्तव्य कर्म को भली-भाँति करते रहो; क्योंकि आसक्ति रहित होकर कर्म करने से मनुष्य परम को प्राप्त होता है।'],
  ['3.21', 'Leading by example',
    'yad yad ācarati śreṣṭhas tat tad evetaro janaḥ / sa yat pramāṇaṁ kurute lokas tad anuvartate',
    'Whatever a great person does, others follow. Whatever standard they set by their example, the world follows.',
    'श्रेष्ठ पुरुष जो-जो आचरण करता है, दूसरे लोग भी वैसा ही करते हैं। वह जो आदर्श स्थापित करता है, संसार उसी का अनुसरण करता है।'],
  ['3.35', 'Your own path (svadharma)',
    'śreyān sva-dharmo viguṇaḥ para-dharmāt sv-anuṣṭhitāt / sva-dharme nidhanaṁ śreyaḥ para-dharmo bhayāvahaḥ',
    "Better is one's own dharma, though imperfectly done, than another's dharma done well. Better to end one's life in one's own dharma; another's dharma is full of fear.",
    'अच्छी तरह निभाए गए दूसरे के धर्म से, गुणरहित होने पर भी अपना धर्म श्रेष्ठ है। अपने धर्म में मरना भी कल्याणकारी है; दूसरे का धर्म भय देने वाला है।'],
  ['4.7', 'Hope when goodness declines',
    'yadā yadā hi dharmasya glānir bhavati bhārata / abhyutthānam adharmasya tadātmānaṁ sṛjāmy aham',
    'Whenever dharma declines and adharma rises, O Bharata, then I manifest Myself.',
    'हे भारत, जब-जब धर्म की हानि होती है और अधर्म बढ़ता है, तब-तब मैं स्वयं को प्रकट करता हूँ।'],
  ['4.38', 'Knowledge that purifies',
    "na hi jñānena sadṛśaṁ pavitram iha vidyate / tat svayaṁ yoga-saṁsiddhaḥ kālenātmani vindati",
    'Nothing in this world purifies like knowledge. One who is perfected in yoga finds it within, in the course of time.',
    'इस संसार में ज्ञान के समान पवित्र करने वाला कुछ भी नहीं है। योग में सिद्ध हुआ व्यक्ति समय आने पर उसे स्वयं अपने भीतर पा लेता है।'],
  ['6.5', 'Being your own friend',
    'uddhared ātmanātmānaṁ nātmānam avasādayet / ātmaiva hy ātmano bandhur ātmaiva ripur ātmanaḥ',
    'Lift yourself up by your own self; do not let yourself sink. For you alone are your own friend, and you alone are your own enemy.',
    'मनुष्य अपने द्वारा अपना उद्धार करे, अपने को नीचे न गिरने दे। क्योंकि मनुष्य स्वयं ही अपना मित्र है और स्वयं ही अपना शत्रु।'],
  ['6.6', 'Befriending the mind',
    'bandhur ātmātmanas tasya yenātmaivātmanā jitaḥ / anātmanas tu śatrutve vartetātmaiva śatru-vat',
    'For one who has mastered the mind, the mind is the best of friends; for one who has not, the mind behaves like an enemy.',
    'जिसने अपने मन को जीत लिया है, उसके लिए मन सबसे अच्छा मित्र है; पर जिसने उसे नहीं जीता, उसके लिए वही मन शत्रु की तरह व्यवहार करता है।'],
  ['6.17', 'Balance in daily life',
    'yuktāhāra-vihārasya yukta-ceṣṭasya karmasu / yukta-svapnāvabodhasya yogo bhavati duḥkha-hā',
    'For one who is moderate in eating and recreation, balanced in work, and regular in sleep and waking, yoga becomes the remover of sorrow.',
    'जो आहार और विहार में संयमित है, कर्मों में संतुलित चेष्टा करता है, और जिसका सोना-जागना नियमित है, उसके लिए योग दुःखों का नाश करने वाला होता है।'],
  ['6.26', 'Bringing back the wandering mind',
    'yato yato niścalati manaś cañcalam asthiram / tatas tato niyamyaitad ātmany eva vaśaṁ nayet',
    'Wherever the restless, unsteady mind wanders, from there gently draw it back and bring it to rest in the Self.',
    'यह चंचल और अस्थिर मन जहाँ-जहाँ भटके, वहाँ-वहाँ से इसे रोककर बार-बार आत्मा में ही लगाना चाहिए।'],
  ['6.35', 'Practice and detachment',
    'asaṁśayaṁ mahā-bāho mano durnigrahaṁ calam / abhyāsena tu kaunteya vairāgyeṇa ca gṛhyate',
    'Without doubt, O mighty-armed one, the mind is restless and hard to hold. But, O son of Kunti, it is mastered through practice and detachment.',
    'हे महाबाहो, निस्संदेह मन चंचल है और उसे वश में करना कठिन है। परन्तु हे कुन्तीपुत्र, अभ्यास और वैराग्य से इसे वश में किया जा सकता है।'],
  ['12.13', 'Compassion and friendliness',
    'adveṣṭā sarva-bhūtānāṁ maitraḥ karuṇa eva ca / nirmamo nirahaṅkāraḥ sama-duḥkha-sukhaḥ kṣamī',
    'One who bears ill will towards no being, who is friendly and compassionate, free from possessiveness and ego, even-minded in pain and pleasure, and forgiving (is dear to Me).',
    'जो किसी भी प्राणी से द्वेष नहीं करता, सबका मित्र और करुणामय है, ममता और अहंकार से रहित है, सुख-दुःख में समान है और क्षमाशील है (वह मुझे प्रिय है)।'],
  ['17.15', 'Kind and truthful speech',
    'anudvega-karaṁ vākyaṁ satyaṁ priya-hitaṁ ca yat / svādhyāyābhyasanaṁ caiva vāṅ-mayaṁ tapa ucyate',
    'Words that cause no distress, that are truthful, pleasant and beneficial, together with the regular practice of sacred study, are called the discipline of speech.',
    'जो वाणी उद्वेग न करने वाली, सत्य, प्रिय और हितकारी हो, तथा स्वाध्याय का अभ्यास — यह वाणी का तप कहलाता है।'],
  ['18.66', 'Surrender and letting go',
    'sarva-dharmān parityajya mām ekaṁ śaraṇaṁ vraja / ahaṁ tvāṁ sarva-pāpebhyo mokṣayiṣyāmi mā śucaḥ',
    'Setting aside all forms of dharma, take refuge in Me alone. I will free you from all sins; do not grieve.',
    'सब धर्मों को छोड़कर केवल मेरी शरण में आ जाओ। मैं तुम्हें सब पापों से मुक्त कर दूँगा; शोक मत करो।'],
];

const NOT_DAILY = new Set(['3.35']);

/**
 * @typedef {{ id:string, chapter:number, verse:number, chapterName:string, theme:string,
 *             iast:string, en:string, hi:string, daily:boolean }} Verse
 */

/** @type {readonly Verse[]} */
export const VERSES = Object.freeze(RAW.map(([id, theme, iast, en, hi]) => {
  const [chapter, verse] = id.split('.').map(Number);
  return Object.freeze({
    id, chapter, verse, chapterName: NAMES[chapter - 1], theme, iast, en, hi, daily: !NOT_DAILY.has(id),
  });
}));

export const VERSE_REFS = Object.freeze(VERSES.map((v) => v.id));

const BY_ID = new Map(VERSES.map((v) => [v.id, v]));

/** Accepts '2.47', 'BG 2.47', '2:47'. */
export function getVerse(ref) {
  if (typeof ref !== 'string') return null;
  const m = ref.trim().match(/^(?:bg\s*)?(\d{1,2})\s*[.:]\s*(\d{1,3})$/i);
  if (!m) return null;
  return BY_ID.get(`${Number(m[1])}.${Number(m[2])}`) || null;
}

export function isValidRef(chapter, verse) {
  const c = Number(chapter);
  const v = Number(verse);
  if (!Number.isInteger(c) || !Number.isInteger(v)) return false;
  if (c < 1 || c > 18 || v < 1) return false;
  return v <= COUNTS[c - 1];
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.floor((a - b) / 86400000) + 1;
}

const DAILY = VERSES.filter((v) => v.daily);

/** Deterministic per local calendar day; never returns a non-daily verse (e.g. 3.35). */
export function verseOfTheDay(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return DAILY[dayOfYear(d) % DAILY.length];
}

/**
 * Link to the verse on vedabase.io. Validation and refs use the 700-verse Gita Press numbering, but
 * vedabase (BBT edition) prefixes chapter 13 with Arjuna's question as 13.1, so its chapter 13 runs
 * one ahead: Gita Press 13.n is vedabase 13.(n+1). See SPEC.md §3.5 (verse numbering).
 */
export function externalVerseUrl(ch, v) {
  const c = Number(ch);
  const n = Number(v) + (c === 13 ? 1 : 0);
  return `https://vedabase.io/en/library/bg/${c}/${n}/`;
}
