import json

TRANSLATIONS_PATH = 'vocabularies/Translations.json'

new_vocabulary = {
    'vocabularies': [],
    'words': {}
}

old_vocabularies = [
    {'path': 'vocabularies/Family_Members.json', 'id': 'family'},
    {'path': 'vocabularies/Textbook_Names.json', 'id': 'textbook-names'},
    {'path': 'vocabularies/Textbook_Lessons_1_5.json', 'id': 'textbook-lessons-1-5'},
    {'path': 'vocabularies/Numbers.json', 'id': 'numbers'},
]

with open(TRANSLATIONS_PATH, 'r', encoding='utf-8') as f:
    translations = json.load(f)
    for word in translations:
        new_word_obj = {
            'pinyin': word['pinyin'],
            'EN': word['EN'],
            'ES': word['ES'],
            'vocabularies': []
        }
        for vocab in old_vocabularies:
            with open(vocab['path'], 'r', encoding='utf-8') as vf:
                vocab_data = json.load(vf)
                if word['hanzi'] in vocab_data['words']:
                    new_word_obj['vocabularies'].append(vocab['id'])
        new_vocabulary['words'][word['hanzi']] = new_word_obj

for vocab in old_vocabularies:
    with open(vocab['path'], 'r', encoding='utf-8') as vf:
        vocab_data = json.load(vf)
        new_vocabulary['vocabularies'].append({
            'id': vocab['id'],
            'Name': vocab_data['Name'],
            'pill': vocab_data['pill']
        })

with open('vocabularies/Refactored_Vocabulary.json', 'w', encoding='utf-8') as f:
    json.dump(new_vocabulary, f, ensure_ascii=False, indent=4)