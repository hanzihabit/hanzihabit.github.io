import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import locales from '../locales.json';
import vocabularyData from '../vocabularies.json';
import dongChineseImage from '../dongchinese.png';

const STORAGE_KEY = 'hanzi-habit-vocabulary-v1';
const DEFAULT_SESSION_SIZE = 30;
const DEFAULT_LOCALE = 'ES';

const LOCALE = locales[DEFAULT_LOCALE];

const PRELOADED_VOCABULARIES = vocabularyData.vocabularies;
const WORDS_BY_HANZI = vocabularyData.words;
const DEFAULT_SESSION_CONTROLS = {
  'hanzi-pinyin': true,
  'hanzi-meaning': true,
  'pinyin-meaning': true
};
const blankState = { entries: [], manualEntries: [], enabledVocabularyIds: [], wordOverrides: {}, weights: {}, sessionSize: DEFAULT_SESSION_SIZE, enabledSessionControls: DEFAULT_SESSION_CONTROLS };

function normaliseSessionSize(value) {
  return Math.max(1, Math.floor(Number(value) || DEFAULT_SESSION_SIZE));
}

function storedData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || blankState;
    const manualEntries = saved.manualEntries ?? saved.entries ?? [];
    return prepareData({ ...blankState, ...saved, manualEntries, sessionSize: normaliseSessionSize(saved.sessionSize) });
  } catch {
    return blankState;
  }
}

function keyFor(id, type) {
  return `${id}:${type}`;
}

function pairValues(entry, type) {
  if (type === 'hanzi-pinyin') return [entry.hanzi, entry.pinyin];
  if (type === 'hanzi-meaning') return [entry.hanzi, entry.meaning];
  return [entry.pinyin, entry.meaning];
}

function pairLabels(type) {
  if (type === 'hanzi-pinyin') return ['Hanzi', 'Pinyin'];
  if (type === 'hanzi-meaning') return ['Hanzi', 'Translation'];
  return ['Pinyin', 'Translation'];
}

function remainingValue(entry, type) {
  if (type === 'hanzi-pinyin') return entry.meaning;
  if (type === 'hanzi-meaning') return entry.pinyin;
  return entry.hanzi;
}

function someEnabledSessionControls(data) {
  return data.enabledSessionControls['hanzi-pinyin'] || data.enabledSessionControls['hanzi-meaning'] || data.enabledSessionControls['pinyin-meaning'];
}

function vocabularyText(entries) {
  return entries.map(({ hanzi, pinyin, meaning }) => `${hanzi}, ${pinyin}, ${meaning}`).join('\n');
}

function sourceEntries(vocabulary) {
  return Object.entries(WORDS_BY_HANZI)
    .filter(([, word]) => word.vocabularies.includes(vocabulary.id))
    .map(([hanzi, word]) => ({ hanzi, pinyin: word.pinyin, meaning: word[DEFAULT_LOCALE] }));
}

function vocabulariesForWord(hanzi) {
  const word = WORDS_BY_HANZI[hanzi];
  return PRELOADED_VOCABULARIES.filter((vocabulary) => word?.vocabularies.includes(vocabulary.id));
}

function VocabularyPills({ hanzi }) {
  const vocabularies = vocabulariesForWord(hanzi);
  if (!vocabularies.length) return null;
  return <div className="word-source-pills" aria-label="Included vocabularies">
    {vocabularies.map((vocabulary) => <span className="vocabulary-pill" key={vocabulary.id} style={{ backgroundColor: vocabulary.pill.color, color: vocabulary.pill.textcolor }} title={vocabulary.Name}>
      {vocabulary.pill.text}
    </span>)}
  </div>;
}

function composeEntries(data) {
  const entries = new Map();
  PRELOADED_VOCABULARIES.filter((vocabulary) => data.enabledVocabularyIds.includes(vocabulary.id)).forEach((vocabulary) => {
    sourceEntries(vocabulary).forEach((entry) => {
      const override = data.wordOverrides?.[entry.hanzi];
      if (override !== null) entries.set(entry.hanzi, override || entry);
    });
  });
  (data.manualEntries || []).forEach((entry) => entries.set(entry.hanzi, entry));
  return [...entries.values()].map((entry) => ({ ...entry, id: entry.hanzi }));
}

function prepareData(data) {
  const entries = composeEntries(data);
  const weights = { ...data.weights };
  entries.forEach((entry) => ['hanzi-pinyin', 'hanzi-meaning', 'pinyin-meaning'].forEach((type) => {
    const key = keyFor(entry.id, type);
    weights[key] = Math.max(1, Number(weights[key]) || 1);
  }));
  return { ...data, entries, weights };
}

function buildData(rows) {
  const prior = storedData();
  // Hanzi is the durable identity, so editing Pinyin or a translation preserves progress.
  const uniqueRows = [...new Map(rows.map(([hanzi, pinyin, meaning]) => [hanzi, [hanzi, pinyin, meaning]])).values()];
  const manualEntries = uniqueRows.map(([hanzi, pinyin, meaning]) => ({ hanzi, pinyin, meaning }));
  return prepareData({ ...prior, manualEntries });
}

function parseVocabulary(text) {
  return text.split(/\r?\n/).map((line) => line.split(',').map((part) => part.trim()))
    .filter((parts) => parts.length >= 3 && parts[0] && parts[1] && parts[2])
    .map((parts) => parts.slice(0, 3));
}

function makeDeck(data, sessionSize) {
  const relationships = [];
  const allowedTypes = Object.entries(data.enabledSessionControls).filter(([, enabled]) => enabled).map(([type]) => type);
  data.entries.forEach((entry) => {
    allowedTypes.forEach((type) => {
      relationships.push({ entry, type, key: keyFor(entry.id, type) });
    });
  });
  const availableRelationships = [...relationships];
  const deckSize = Math.min(sessionSize, availableRelationships.length);

  return Array.from({ length: deckSize }, () => {
    const totalWeight = availableRelationships.reduce((total, relation) => total + Math.max(1, data.weights[relation.key] || 1), 0);
    let target = Math.random() * totalWeight;
    const cardIndex = availableRelationships.findIndex((relation) => {
      target -= Math.max(1, data.weights[relation.key] || 1);
      return target < 0;
    });
    const [card] = availableRelationships.splice(cardIndex, 1);
    const [first, second] = pairValues(card.entry, card.type);
    const [firstLabel, secondLabel] = pairLabels(card.type);
    return Math.random() < 0.5
      ? { ...card, front: first, back: second, promptLabel: firstLabel, answerLabel: secondLabel, hanzi: card.entry.hanzi }
      : { ...card, front: second, back: first, promptLabel: secondLabel, answerLabel: firstLabel, hanzi: card.entry.hanzi };
  });
}

function normalizeToBasicLatin(input) {
  input = input.toLowerCase().trim()
  input = input.replace('ā', 'a').replace('á', 'a').replace('ǎ', 'a').replace('à', 'a')
  input = input.replace('ē', 'e').replace('é', 'e').replace('ě', 'e').replace('è', 'e')
  input = input.replace('ī', 'i').replace('í', 'i').replace('ǐ', 'i').replace('ì', 'i')
  input = input.replace('ō', 'o').replace('ó', 'o').replace('ǒ', 'o').replace('ò', 'o')
  input = input.replace('ū', 'u').replace('ú', 'u').replace('ǔ', 'u').replace('ù', 'u')
  return input.replace(' ', '').replace("'", '')
}

function filterWord(word, wordSearch) {
  const search = normalizeToBasicLatin(wordSearch);
  if (!search) return true;
  return normalizeToBasicLatin(word.hanzi).includes(search) || normalizeToBasicLatin(word.pinyin).includes(search) || normalizeToBasicLatin(word.meaning).includes(search);
}

function App() {
  const [data, setData] = useState(storedData);
  const [activeTab, setActiveTab] = useState('practice');
  const [input, setInput] = useState('');
  const [isDebugImportOpen, setDebugImportOpen] = useState(false);
  const [expandedVocabularyId, setExpandedVocabularyId] = useState(null);
  const [newWord, setNewWord] = useState({ hanzi: '', pinyin: '', meaning: '' });
  const [editingVocabularyId, setEditingVocabularyId] = useState(null);
  const [vocabularyDraft, setVocabularyDraft] = useState({ hanzi: '', pinyin: '', meaning: '' });
  const [deck, setDeck] = useState([]);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState('');
  const [editingWeightId, setEditingWeightId] = useState(null);
  const [weightDraft, setWeightDraft] = useState({});
  const [wordSearch, setWordSearch] = useState('');
  const cardRef = useRef(null);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data]);

  const card = deck[position];
  const remaining = Math.max(0, deck.length - position);
  const totalRelationships = data.entries.length * 3;

  function loadVocabulary() {
    const rows = parseVocabulary(input);
    if (!rows.length) {
      setNotice(`${LOCALE.LOAD_VOCABULARY_FORMAT_NOTICE}.`);
      return;
    }
    setData(buildData(rows));
    setDeck([]);
    setNotice(`${rows.length} ${LOCALE.WORDS_LOADED_NOTICE}`);
    setActiveTab('practice');
    setInput(vocabularyText(rows.map(([hanzi, pinyin, meaning]) => ({ hanzi, pinyin, meaning }))));
  }

  function selectTab(tab) {
    if (tab === 'vocabulary') setInput(vocabularyText(data.entries));
    setActiveTab(tab);
  }

  function setVocabularyEnabled(id, enabled) {
    setData((current) => prepareData({
      ...current,
      enabledVocabularyIds: enabled ? [...current.enabledVocabularyIds, id] : current.enabledVocabularyIds.filter((item) => item !== id),
    }));
    setDeck([]);
    setPosition(0);
    setRevealed(false);
  }

  function setSessionControl(type, enabled) {
    setData((current) => prepareData({
      ...current,
      enabledSessionControls: { ...current.enabledSessionControls, [type]: enabled },
    }));
    setDeck([]);
    setPosition(0);
    setRevealed(false);
  }

  function addWord() {
    const word = Object.fromEntries(Object.entries(newWord).map(([key, value]) => [key, value.trim()]));
    if (!word.hanzi || !word.pinyin || !word.meaning) {
      setNotice(`${LOCALE.ADD_WORD_NOTICE}.`);
      return;
    }
    setData((current) => prepareData({
      ...current,
      manualEntries: [...current.manualEntries.filter((entry) => entry.hanzi !== word.hanzi), word],
    }));
    setNewWord({ hanzi: '', pinyin: '', meaning: '' });
    setNotice(`${word.hanzi} ${LOCALE.WORD_ADDED_NOTICE}`);
  }

  function openVocabularyEditor(entry) {
    setEditingVocabularyId(entry.id);
    setVocabularyDraft({ hanzi: entry.hanzi, pinyin: entry.pinyin, meaning: entry.meaning });
  }

  function saveVocabularyEntry(entry) {
    const word = Object.fromEntries(Object.entries(vocabularyDraft).map(([key, value]) => [key, value.trim()]));
    if (!word.hanzi || !word.pinyin || !word.meaning) {
      setNotice(`${LOCALE.SAVE_VOCABULARY_FORMAT_NOTICE}.`);
      return;
    }
    setData((current) => {
      const isManual = current.manualEntries.some((item) => item.hanzi === entry.hanzi);
      const isRenamed = entry.hanzi !== word.hanzi;
      const manualEntries = isManual
        ? current.manualEntries.filter((item) => item.hanzi !== entry.hanzi && item.hanzi !== word.hanzi).concat(word)
        : isRenamed ? current.manualEntries.filter((item) => item.hanzi !== word.hanzi).concat(word) : current.manualEntries;
      const wordOverrides = isManual
        ? current.wordOverrides
        : { ...current.wordOverrides, [entry.hanzi]: isRenamed ? null : word };
      return prepareData({ ...current, manualEntries, wordOverrides });
    });
    setEditingVocabularyId(null);
    setNotice(`${word.hanzi} was updated.`);
  }

  function deleteVocabularyEntry(entry) {
    setData((current) => {
      const isManual = current.manualEntries.some((item) => item.hanzi === entry.hanzi);
      return prepareData({
        ...current,
        manualEntries: isManual ? current.manualEntries.filter((item) => item.hanzi !== entry.hanzi) : current.manualEntries,
        wordOverrides: isManual ? current.wordOverrides : { ...current.wordOverrides, [entry.hanzi]: null },
      });
    });
    setDeck([]);
    setPosition(0);
    setRevealed(false);
    setEditingVocabularyId(null);
    setEditingWeightId(null);
    setNotice(`${entry.hanzi} ${LOCALE.WORD_REMOVED_NOTICE}.`);
  }

  function removeWholeVocabulary() {
    setData(() => prepareData({
      ...blankState,
      enabledSessionControls: { ...DEFAULT_SESSION_CONTROLS },
    }));
    setDeck([]);
    setPosition(0);
    setRevealed(false);
    setEditingVocabularyId(null);
    setEditingWeightId(null);
    setExpandedVocabularyId(null);
    setInput('');
    setWordSearch('');
    setActiveTab('vocabulary');
    setNotice('Whole vocabulary removed.');
  }

  function updateSessionSize(value) {
    setData((current) => ({ ...current, sessionSize: value === '' ? '' : normaliseSessionSize(value) }));
  }

  function finaliseSessionSize() {
    setData((current) => ({ ...current, sessionSize: normaliseSessionSize(current.sessionSize) }));
  }

  function startPractice() {
    if (!data.entries.length) {
      setActiveTab('vocabulary');
      setNotice(`${LOCALE.START_PRACTICE_MISSING_VOCABULARY_NOTICE}.`);
      return;
    }
    const sessionSize = normaliseSessionSize(data.sessionSize);
    setData((current) => current.sessionSize === sessionSize ? current : { ...current, sessionSize });
    setDeck(makeDeck(data, sessionSize));
    setPosition(0);
    setRevealed(false);
    setNotice('');
  }

  function grade(delta) {
    if (!card) return;
    setData((current) => ({
      ...current,
      weights: { ...current.weights, [card.key]: Math.max(1, (current.weights[card.key] || 1) + delta) },
    }));
    setPosition((current) => current + 1);
    setRevealed(false);
  }

  function handleArrow(direction) {
    if (!card) return;
    if (direction === 'up') setRevealed(true);
    if (direction === 'left') grade(1);
    if (direction === 'right') grade(-1);
  }

  function openWeightEditor(entry) {
    setEditingWeightId(entry.id);
    setWeightDraft(Object.fromEntries(['hanzi-pinyin', 'hanzi-meaning', 'pinyin-meaning'].map((type) => [type, data.weights[keyFor(entry.id, type)] || 1])));
  }

  function saveWeights(entry) {
    setData((current) => ({
      ...current,
      weights: {
        ...current.weights,
        ...Object.fromEntries(['hanzi-pinyin', 'hanzi-meaning', 'pinyin-meaning'].map((type) => [
          keyFor(entry.id, type), Math.max(1, Math.floor(Number(weightDraft[type]) || 1)),
        ])),
      },
    }));
    setEditingWeightId(null);
    setNotice(`Weights saved for ${entry.hanzi}.`);
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (activeTab !== 'practice' || !card || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') return;
      if (event.key === 'ArrowUp') { event.preventDefault(); handleArrow('up'); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); handleArrow('left'); }
      if (event.key === 'ArrowRight') { event.preventDefault(); handleArrow('right'); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, card]);

  const relationshipText = useMemo(() => totalRelationships === 1 ? LOCALE.RELATIONSHIP : LOCALE.RELATIONSHIPS, [totalRelationships]);

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" onClick={(event) => event.preventDefault()}><span>汉</span> Hanzi Habit</a>
      <nav className="tabs" aria-label="Main navigation" role="tablist">
        <button className={`tab ${activeTab === 'vocabulary' ? 'is-active' : ''}`} onClick={() => selectTab('vocabulary')} role="tab" aria-selected={activeTab === 'vocabulary'}>{LOCALE.VOCABULARY}</button>
        <button className={`tab ${activeTab === 'weights' ? 'is-active' : ''}`} onClick={() => selectTab('weights')} role="tab" aria-selected={activeTab === 'weights'}>{LOCALE.WEIGHTS}</button>
        <button className={`tab ${activeTab === 'practice' ? 'is-active' : ''}`} onClick={() => selectTab('practice')} role="tab" aria-selected={activeTab === 'practice'}>{LOCALE.PRACTICE}</button>
      </nav>
    </header>

    {activeTab === 'vocabulary' && <section className="vocabulary-tab" aria-label="Modify vocabulary" role="tabpanel">
      <div className="vocabulary-heading"><div><p className="panel-kicker">{LOCALE.YOUR_VOCABULARY}</p><h2>{LOCALE.VOCABULARY_HEADER}</h2><p>{LOCALE.VOCABULARY_SUBTITLE}.</p></div></div>
      <div className="source-list">
        {PRELOADED_VOCABULARIES.map((vocabulary) => {
          const enabled = data.enabledVocabularyIds.includes(vocabulary.id);
          const expanded = expandedVocabularyId === vocabulary.id;
          const words = sourceEntries(vocabulary);
          return <article className="source-card" key={vocabulary.id}>
            <div className="source-summary">
              <button className={`source-enable ${enabled ? 'is-enabled' : ''}`} onClick={() => setVocabularyEnabled(vocabulary.id, !enabled)} aria-pressed={enabled}>{enabled ? LOCALE.ENABLED : LOCALE.ENABLE}</button>
              <div><h3 style={{ color: vocabulary.pill.color }}>{vocabulary.Name}</h3><p>{words.length} {LOCALE.WORDS}</p></div>
              <button className="expand-source" onClick={() => setExpandedVocabularyId(expanded ? null : vocabulary.id)} aria-expanded={expanded} aria-label={`${expanded ? LOCALE.HIDE : LOCALE.SHOW} ${vocabulary.Name} words`}>{expanded ? '⌃' : '⌄'}</button>
            </div>
            {expanded && <div className="source-words">
              {words.map((word) => <div key={word.hanzi}><strong>{word.hanzi}</strong><span>{word.pinyin}</span><span>{word.meaning}</span></div>)}
            </div>}
          </article>;
        })}
      </div>

      <section className="add-word-panel" aria-label="Add a word">
        <div><p className="panel-kicker">{LOCALE.EXTRA_WORDS}</p><h2>{LOCALE.ADD_A_WORD}</h2></div>
        <div className="word-fields">
          <input aria-label="Hanzi" value={newWord.hanzi} onChange={(event) => setNewWord((current) => ({ ...current, hanzi: event.target.value }))} placeholder="Hanzi" />
          <input aria-label="Pinyin" value={newWord.pinyin} onChange={(event) => setNewWord((current) => ({ ...current, pinyin: event.target.value }))} placeholder="Pinyin" />
          <input aria-label="Translation" value={newWord.meaning} onChange={(event) => setNewWord((current) => ({ ...current, meaning: event.target.value }))} placeholder="Translation" />
        </div>
        <button className="primary" onClick={addWord}>Add word</button>
      </section>

      <section className="current-vocabulary" aria-label="Current vocabulary">
        <div className="vocabulary-heading"><div><p className="panel-kicker">{LOCALE.CURRENT_VOCABULARY}</p><h2>{data.entries.length} {LOCALE.N_WORDS_READY}</h2></div></div>
        <div className="wordSearch"><input aria-label="Search words" placeholder="Search words..." value={wordSearch} onChange={(event) => setWordSearch(event.target.value)} /></div>
        <div className="current-words">
          {data.entries.filter((entry) => filterWord(entry, wordSearch)).map((entry) => <article className="current-word" key={entry.id}>
            {editingVocabularyId === entry.id ? <div className="word-fields editing-fields">
              <input aria-label="Hanzi" value={vocabularyDraft.hanzi} onChange={(event) => setVocabularyDraft((current) => ({ ...current, hanzi: event.target.value }))} />
              <input aria-label="Pinyin" value={vocabularyDraft.pinyin} onChange={(event) => setVocabularyDraft((current) => ({ ...current, pinyin: event.target.value }))} />
              <input aria-label="Translation" value={vocabularyDraft.meaning} onChange={(event) => setVocabularyDraft((current) => ({ ...current, meaning: event.target.value }))} />
            </div> : <div className="current-word-values"><strong>{entry.hanzi}</strong><span>{entry.pinyin}</span><span>{entry.meaning}</span></div>}
            <VocabularyPills hanzi={entry.hanzi} />
            <div className="word-actions">
              {editingVocabularyId === entry.id ? <><button className="small-button" onClick={() => saveVocabularyEntry(entry)}>{LOCALE.SAVE}</button><button className="small-button muted" onClick={() => setEditingVocabularyId(null)}>{LOCALE.CANCEL}</button></> : <button className="small-button" onClick={() => openVocabularyEditor(entry)}>{LOCALE.EDIT}</button>}
              <button className="small-button remove" onClick={() => deleteVocabularyEntry(entry)}>{LOCALE.DELETE}</button>
            </div>
          </article>)}
        </div>
      </section>

      <section className="debug-import">
        <button className="debug-toggle" onClick={() => setDebugImportOpen((open) => !open)} aria-expanded={isDebugImportOpen}>Debug {isDebugImportOpen ? '⌃' : '⌄'}</button>
        {isDebugImportOpen && <div className="import-panel">
          <div><p className="panel-kicker">{LOCALE.DEBUG_IMPORT}</p><h2>{LOCALE.DEBUG_HEADER}</h2><p>{LOCALE.DEBUG_SUBTITLE}</p></div>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={'你好, nǐ hǎo, hello\n谢谢, xiè xie, thank you'} />
          <button className="primary" onClick={loadVocabulary}>{LOCALE.DEBUG_SAVE}</button>
          <button className="small-button remove" onClick={removeWholeVocabulary}>Remove whole vocabulary</button>
        </div>}
      </section>
    </section>}

    {activeTab === 'weights' && <section className="weights-panel" aria-label="Vocabulary weights" role="tabpanel">
      <div className="weights-heading"><div><p className="panel-kicker">{LOCALE.YOUR_PROGRESS}</p><h2>{LOCALE.CURRENT_WEIGHTS}</h2></div><p>{LOCALE.CURRENT_WEIGHTS_SUBTITLE}</p></div>
      <div className="wordSearch"><input aria-label="Search words" placeholder="Search words..." value={wordSearch} onChange={(event) => setWordSearch(event.target.value)} /></div>
      <div className="weights-list">
        {data.entries.filter((entry) => filterWord(entry, wordSearch)).map((entry) => <article className="weight-card" key={entry.id}>
          <h3>{entry.hanzi}</h3>
          <p className="word-details"><span>{entry.pinyin}</span><span>{entry.meaning}</span></p>
          <VocabularyPills hanzi={entry.hanzi} />
          <dl>
            {['hanzi-pinyin', 'hanzi-meaning', 'pinyin-meaning'].map((type) => {
              const labels = { 'hanzi-pinyin': 'Hanzi ↔ Pinyin', 'hanzi-meaning': `Hanzi ↔ ${LOCALE.MEANING}`, 'pinyin-meaning': `Pinyin ↔ ${LOCALE.MEANING}` };
              return <div key={type}><dt>{labels[type]}</dt><dd>{editingWeightId === entry.id ? <input aria-label={`${labels[type]} weight`} type="number" min="1" value={weightDraft[type] ?? 1} onChange={(event) => setWeightDraft((current) => ({ ...current, [type]: event.target.value }))} /> : data.weights[keyFor(entry.id, type)] || 1}</dd></div>;
            })}
          </dl>
          <div className="weight-actions">
            {editingWeightId === entry.id ? <>
              <button className="small-button" onClick={() => saveWeights(entry)}>{LOCALE.SAVE}</button>
              <button className="small-button muted" onClick={() => setEditingWeightId(null)}>{LOCALE.CANCEL}</button>
            </> : <button className="small-button" onClick={() => openWeightEditor(entry)}>{LOCALE.EDIT_WEIGHTS}</button>}
            <button className="small-button remove" onClick={() => deleteVocabularyEntry(entry)}>{LOCALE.REMOVE_WORD}</button>
          </div>
        </article>)}
      </div>
    </section>}

    {activeTab === 'practice' && <>
    {notice && <p className="notice" role="status">{notice}</p>}

    {!card && position === 0 && <section className="ready-card">
      <div className="circle-mark">学</div>
      <p className="panel-kicker">{data.entries.length ? `${data.entries.length} ${LOCALE.WORDS} · ${totalRelationships} ${relationshipText}` : LOCALE.PERSONAL_DECK}</p>
      <h2>{data.entries.length ? LOCALE.READY_WHEN : LOCALE.START_WITH}</h2>
      <p>{data.entries.length ? LOCALE.WEIGHTS_EXPLAIN : LOCALE.VOCABULARY_EXPLAIN}</p>
      <div className="session-controls">
        {['hanzi-pinyin', 'hanzi-meaning', 'pinyin-meaning'].map((type) => {
          const labels = { 'hanzi-pinyin': 'Hanzi ↔ Pinyin', 'hanzi-meaning': `Hanzi ↔ ${LOCALE.MEANING}`, 'pinyin-meaning': `Pinyin ↔ ${LOCALE.MEANING}` };
          const enabled = data.enabledSessionControls[type];
          return <button className={`source-enable ${enabled ? 'is-enabled' : ''}`} onClick={() => setSessionControl(type, !enabled)} key={type} >{labels[type]}</button>;
        })}
      </div>
      {data.entries.length > 0 && <label className="session-size">{LOCALE.CARDS_THIS_SESSION}
        <input type="number" min="1" value={data.sessionSize} onChange={(event) => updateSessionSize(event.target.value)} onBlur={finaliseSessionSize} />
      </label>}
      <button className="primary startBtn" onClick={startPractice} disabled={!someEnabledSessionControls(data)}>
        {data.entries.length ? LOCALE.BEGIN_PRACTICE : LOCALE.LOAD_VOCABULARY}
      </button>
    </section>}

    {card && <section className="practice" ref={cardRef}>
      <div className="progress-row"><span>{LOCALE.CARD} {position + 1} {LOCALE.OF} {deck.length}</span><span>{remaining} {LOCALE.REMAINING}</span></div>
      <div className={`flashcard ${revealed ? 'is-revealed' : ''}`}>
        <p className="side-label">{revealed ? LOCALE.ANSWER : LOCALE.PROMPT}</p>
        {!revealed && <p className="expected-answer">{LOCALE.GUESS_THE} {card.answerLabel}</p>}
        <div className="card-value">{revealed ? card.back : card.front}</div>
        {revealed && <p className="card-context">({remainingValue(card.entry, card.type)})</p>}
        {!revealed && <button className="reveal" onClick={() => setRevealed(true)}>{LOCALE.SHOW_ANSWER} <kbd>↑</kbd></button>}
        {revealed && <div className="answer-hint">
          <p >{LOCALE.HOW_WELL}</p>
          <a href={`https://www.dong-chinese.com/dictionary/${card.hanzi}`} target="_blank" rel="noopener noreferrer"><img src={dongChineseImage} alt="dongchinese" width="32" height="32" title="Check the character in Dong Chinese!"/></a>
        </div>
        }
      </div>
      <div className={`mobile-controls ${revealed ? 'is-revealed' : ''}`} aria-label="Card controls">
        {!revealed ? <button className="arrow-control reveal-control" onClick={() => handleArrow('up')} aria-label={LOCALE.SHOW_ANSWER}><span>↑</span><small>{LOCALE.REVEAL}</small></button> : <>
          <button className="arrow-control less" onClick={() => handleArrow('left')} aria-label={LOCALE.LEARNING}><span>←</span><small>{LOCALE.LEARNING}</small></button>
          <button className="arrow-control more" onClick={() => handleArrow('right')} aria-label={LOCALE.KNOWN}><span>→</span><small>{LOCALE.KNOWN}</small></button>
        </>}
      </div>
      {/* <p className="keyboard-help">Use <kbd>↑</kbd> to reveal, then <kbd>←</kbd> or <kbd>→</kbd> to continue.</p> */}
    </section>}

    {!card && position > 0 && <section className="complete-card">
      <p className="panel-kicker">{LOCALE.SESSION_COMPLETE}</p><h2>{LOCALE.SESSION_COMPLETE_TITLE}</h2><p>{LOCALE.SESSION_COMPLETE_SUBTITLE_1} {deck.length} {LOCALE.SESSION_COMPLETE_SUBTITLE_2}</p>
      <div className="session-controls">
        {['hanzi-pinyin', 'hanzi-meaning', 'pinyin-meaning'].map((type) => {
          const labels = { 'hanzi-pinyin': 'Hanzi ↔ Pinyin', 'hanzi-meaning': `Hanzi ↔ ${LOCALE.MEANING}`, 'pinyin-meaning': `Pinyin ↔ ${LOCALE.MEANING}` };
          const enabled = data.enabledSessionControls[type];
          return <button className={`source-enable ${enabled ? 'is-enabled' : ''}`} onClick={() => setSessionControl(type, !enabled)} key={type} >{labels[type]}</button>;
        })}
      </div>
      <label className="session-size">{LOCALE.CARDS_NEXT}
        <input type="number" min="1" value={data.sessionSize} onChange={(event) => updateSessionSize(event.target.value)} onBlur={finaliseSessionSize} />
      </label>
      <button className="primary startBtn" onClick={startPractice} disabled={!someEnabledSessionControls(data)}>
        {LOCALE.PRACTICE_AGAIN}
      </button>
    </section>}
    </>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
