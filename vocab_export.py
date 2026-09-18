import json

INPUT    = './vocabularies.json'
OUTPUT   = './vocabualries.csv'
LANGUAGE = 'EN'

with open(INPUT, 'r') as f:
    with open(OUTPUT, 'w') as out:
        out.write('Hanzi,Pinyin,Meaning\n')
        vocabulary = json.load(f)
        words = []
        for word in vocabulary['words'].keys():
            out.write(f'{word},{vocabulary['words'][word]['pinyin']},{vocabulary['words'][word][LANGUAGE]}\n')
