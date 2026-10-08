/* Conversation starters for the home screen. `label` is the chip text,
   `prompt` is what gets sent. `lang` marks non-English prompts. */

export const STARTERS = [
  { id: 'grief', label: 'Grief', hint: 'Losing someone I love',
    prompt: "I lost someone close to me and I can't stop thinking about them. How does the Gita see grief and loss?" },
  { id: 'duty', label: 'Duty vs desire', hint: 'Torn between what I should do and what I want',
    prompt: "I'm torn between what my family expects of me and what I actually want to do with my life. How do I find my own dharma?" },
  { id: 'results', label: 'Anxiety about results', hint: 'Exams, interviews, outcomes',
    prompt: "I'm anxious about results I can't control — exams, a job interview, how things will turn out. How can I work hard without being consumed by the outcome?" },
  { id: 'anger', label: 'Anger', hint: 'Losing my temper',
    prompt: "I get angry quickly and say things I regret later. What does the Gita say about anger and how to steady the mind?" },
  { id: 'purpose', label: 'Purpose', hint: 'What am I here for?',
    prompt: "I feel lost about my purpose. I go through the motions every day but don't know what it's all for. Where do I begin?" },
  { id: 'burnout', label: 'Burnout', hint: 'Exhausted by work',
    prompt: "I'm exhausted by work and feel like I'm running on empty. How do I keep doing my duty without burning out?" },
];

export const MORE_STARTERS = [
  { id: 'overthinking', label: 'Overthinking', hint: 'A mind that will not rest',
    prompt: "My mind won't stop overthinking — replaying conversations and imagining worst cases. How do I quiet a restless mind?" },
  { id: 'failure', label: 'Failure', hint: 'After a setback',
    prompt: "I failed at something that mattered a lot to me and I feel worthless. How do I get up again?" },
  { id: 'loneliness', label: 'Loneliness', hint: 'Feeling alone',
    prompt: "I feel lonely even when I'm surrounded by people. Does the Gita have anything to say to someone who feels alone?" },
  { id: 'letting-go', label: 'Letting go', hint: 'Holding on too tight',
    prompt: "I keep holding on to something — a relationship, a past mistake — that I know I need to let go of. How do I actually let go?" },
  { id: 'hi-man', label: 'मन अशांत है', hint: 'हिन्दी में बात करें', lang: 'hi',
    prompt: 'मेरा मन बहुत अशांत रहता है और किसी काम में मन नहीं लगता। गीता इस बारे में क्या कहती है?' },
  { id: 'hinglish-career', label: 'Career confusion', hint: 'Hinglish', lang: 'hi-Latn',
    prompt: 'Mujhe samajh nahi aa raha ki career mein aage kya karun. Gita ke hisaab se sahi decision kaise lun?' },
];
