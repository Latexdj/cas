"""Imports one demo listing through the running backend's real API
(parse, then save with per-subject Absent counts), the same two calls the
Import page makes. Usage: python3 import_year.py <year> <token>"""
import json, random, sys, urllib.request
year, token = sys.argv[1], sys.argv[2]
H = {'content-type': 'application/json', 'authorization': 'Bearer ' + token}
def post(path, body):
    req = urllib.request.Request('http://localhost:4000' + path, data=json.dumps(body).encode(), headers=H)
    return json.load(urllib.request.urlopen(req))
res = post('/api/admin/exam-results/parse', {'raw_text': open(f'listing_{year}.txt').read()})
counts = {}
for c in res['candidates']:
    for g in c['grades']:
        d = counts.setdefault(g['subjectName'], [0, 0, 0, 0])
        i = 0 if c['gender'] == 'Male' else 1
        d[(2 if g['grade'] == 'X' else 0) + i] += 1
rng = random.Random(int(year))
reg = {}
for s, (pb, pg, cb, cg) in counts.items():
    ab, ag = int(rng.random() < 0.3), int(rng.random() < 0.3)
    reg[s] = {'registeredBoys': pb + cb + ab, 'registeredGirls': pg + cg + ag, 'absentBoys': ab, 'absentGirls': ag}
b = post('/api/admin/exam-results/batches', {'exam_body': 'WAEC', 'year': int(year), 'source': 'paste',
         'raw_text': res['rawText'], 'school_number': res['schoolNumber'], 'registered_data': reg})
print(year, b.get('id'), len(res['candidates']), 'candidates')
