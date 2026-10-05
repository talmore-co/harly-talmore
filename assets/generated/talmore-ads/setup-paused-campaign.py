"""Approved paused setup. Run using uv --env-file .env.local. Never activates ads."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
STATE = ROOT / 'meta-paused-state.json'
state = json.loads(STATE.read_text()) if STATE.exists() else {}
ACCOUNT = 'act_381346933044992'
PIXEL = '386857778990954'
PAGE = '336278177582324'
DEST = 'https://ats.talmore.co/jobs/robot-operations'

def api(path, params, write=False):
    encoded = urllib.parse.urlencode({k: json.dumps(v) if isinstance(v, (dict, list, bool)) else v for k, v in params.items()}).encode()
    url = 'https://graph.facebook.com/v25.0/' + path
    req = urllib.request.Request(url if write else url + '?' + encoded.decode(), data=encoded if write else None, headers={'Authorization': 'Bearer ' + os.environ['ACCESS_TOKEN']})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = json.loads(error.read()).get('error', {})
        raise SystemExit(json.dumps({k: detail[k] for k in ['code', 'error_subcode', 'message', 'error_user_title', 'error_user_msg'] if k in detail}))

def create(key, edge, payload):
    if key not in state:
        state[key] = api(ACCOUNT + '/' + edge, payload, True)['id']
        STATE.write_text(json.dumps(state, indent=2) + '\n')
    print(key, state[key])
    return state[key]

conversion = create('custom_conversion', 'customconversions', {
    'name': 'Robot Operator | QualifiedApplication | ATS threshold 70',
    'event_source_id': PIXEL, 'custom_event_type': 'SUBMIT_APPLICATION',
    'rule': {'and': [{'event': {'eq': 'QualifiedApplication'}}, {'URL': {'i_contains': 'ats.talmore.co/jobs/robot-operations'}}]},
    'description': 'QualifiedApplication from Robot Operator hosted form. ATS threshold currently 70; score is not sent to Meta.',
})
campaign = create('campaign', 'campaigns', {
    'name': 'Robot Operator | Alabang | Website applications | ABO',
    'objective': 'OUTCOME_LEADS', 'status': 'PAUSED',
    'special_ad_categories': ['EMPLOYMENT'], 'buying_type': 'AUCTION',
    'is_adset_budget_sharing_enabled': False,
})
api(campaign, {'special_ad_category_country': ['PH']}, True)
adset = create('adset', 'adsets', {
    'campaign_id': campaign, 'name': 'Muntinlupa +25km | Broad | Qualified applications',
    'status': 'PAUSED', 'lifetime_budget': 28000,
    'start_time': '2026-09-18T09:00:00+08:00', 'end_time': '2026-10-02T09:00:00+08:00',
    'billing_event': 'IMPRESSIONS', 'optimization_goal': 'OFFSITE_CONVERSIONS',
    'bid_strategy': 'LOWEST_COST_WITHOUT_CAP', 'destination_type': 'WEBSITE',
    'promoted_object': {'custom_conversion_id': conversion},
    'targeting': {'geo_locations': {'cities': [{'key': '1750169', 'radius': 25, 'distance_unit': 'kilometer'}]}, 'age_min': 18, 'age_max': 65, 'targeting_automation': {'advantage_audience': 0}},
})
import base64
import re

copy = (ROOT / 'revised-ad-copy.md').read_text()
sections = re.split(r'\n## ', copy)
tags = 'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=robot_operator_alabang&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}'
for number in range(1, 6):
    code = f'R{number}'
    section = next(s for s in sections if s.startswith(code + ':') or s.startswith(code + ' and'))
    body = section.split('**Primary text**\n\n')[1].split('\n\n**Ad headline:**')[0]
    title = section.split('**Ad headline:** ')[1].split('\n')[0]
    description = section.split('**Description:** ')[1].split('\n')[0]
    hashes = {}
    for placement, path in [('feed', ROOT / 'revised-exports' / f'{code}-robot-operator.png'), ('vertical', ROOT / 'vertical-exports' / f'{code}-stories-reels.png')]:
        key = f'{code}_{placement}_hash'
        if key not in state:
            uploaded = api(ACCOUNT + '/adimages', {'bytes': base64.b64encode(path.read_bytes()).decode()}, True)
            state[key] = next(iter(uploaded['images'].values()))['hash']
            STATE.write_text(json.dumps(state, indent=2) + '\n')
        hashes[placement] = state[key]
    creative = create(code + '_creative_pagebacked', 'adcreatives', {
        'name': code + ' | Robot Operator | Feed + Stories/Reels',
        'object_story_spec': {'page_id': PAGE, 'instagram_user_id': '17841445815614432'},
        'url_tags': tags,
        'asset_feed_spec': {
            'ad_formats': ['SINGLE_IMAGE'], 'optimization_type': 'PLACEMENT',
            'images': [{'hash': h, 'adlabels': [{'name': label}]} for label, h in hashes.items()],
            'bodies': [{'text': body}], 'titles': [{'text': title}],
            'descriptions': [{'text': description}], 'call_to_action_types': ['LEARN_MORE'],
            'link_urls': [{'website_url': DEST}],
            'asset_customization_rules': [
                {'customization_spec': {'publisher_platforms': ['facebook', 'instagram'], 'facebook_positions': ['story', 'facebook_reels'], 'instagram_positions': ['story', 'reels']}, 'image_label': {'name': 'vertical'}, 'priority': 1},
                {'customization_spec': {}, 'image_label': {'name': 'feed'}, 'priority': 2},
            ],
        },
    })
    create(code + '_ad', 'ads', {'name': code + ' | ' + section.split('\n')[0].split(': ')[-1], 'adset_id': adset, 'creative': {'creative_id': creative}, 'status': 'PAUSED', 'conversion_domain': 'ats.talmore.co'})
print('Five ads created PAUSED.')
