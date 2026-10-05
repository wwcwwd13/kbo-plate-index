"""Export display effects from the same validated replay used for deployment."""
import argparse
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--run-manifest', type=Path, required=True)
args = p.parse_args()
run = args.run_manifest.resolve().parent
read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
manifest = read(args.run_manifest)
if read(run/'validation.json')['errors']:
    raise ValueError('Calculation must pass validation before export')
families = {'v4.1': ('config.json','rating')} if manifest['base_model'].startswith('kpi-v4.1-') else {'v4':('config.json','rating')}
if manifest.get('comparison_v4_model_version'): families['v4'] = ('config-v4.json','rating-v4')
out = {}
for family,(config_file,folder) in families.items():
    config = read(run/config_file); state = read(run/folder/'state.json')
    assert state['last_date'] == manifest['as_of']
    scale = state['display']['scale']; c = config['internal_coefficients']
    out[family] = dict(asOf=manifest['as_of'],modelVersion=config['model_version'],
        hand=scale*c['hand_theta'],
        fatigueCoefficient=scale*c['fatigue_at_n26_theta']/26**config['params']['fatigue_p'],
        fatigueExponent=config['params']['fatigue_p'],
        parks=[dict(name=name,points=scale*theta) for name,theta in config['park']['theta_offsets'].items()])
target = Path(__file__).resolve().parents[1]/'src/content/model-effects.json'
target.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Updated model effects:', ', '.join(out))
