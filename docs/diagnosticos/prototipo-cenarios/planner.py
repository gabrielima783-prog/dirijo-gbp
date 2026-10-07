"""Planejador editorial isolado. Não coleta dados, gera alegações ou altera a aplicação."""
import json
from copy import deepcopy
from pathlib import Path

RULES = json.loads(Path(__file__).with_name('cenarios.json').read_text())
STATES = {'present_assessed', 'present_unassessed', 'absent_confirmed',
          'not_provided', 'not_found', 'collection_failed', 'restricted'}
LABELS = {
    'present_assessed': 'Avaliado', 'present_unassessed': 'Identificado, a avaliar',
    'absent_confirmed': 'Ausência confirmada', 'not_provided': 'Não informado',
    'not_found': 'Não localizado na pesquisa', 'collection_failed': 'Leitura indisponível',
    'restricted': 'Acesso restrito',
}


def plan(payload):
    channels, warnings = {}, []
    for name in ('google', 'instagram', 'site'):
        channel = deepcopy(payload.get('channels', {}).get(name, {'state': 'not_provided'}))
        if channel.get('state') not in STATES:
            raise ValueError(f'Estado inválido de {name}')
        if channel['state'] == 'absent_confirmed':
            proof = channel.get('confirmation', {})
            if not all(proof.get(k) for k in ('method', 'date', 'reference')):
                warnings.append(f'{name}: ausência sem confirmação foi reclassificada como não informada')
                channel['state'] = 'not_provided'
        if channel['state'] == 'present_assessed' and not channel.get('evidence_refs'):
            warnings.append(f'{name}: avaliação sem evidência foi reclassificada como identificado, a avaliar')
            channel['state'] = 'present_unassessed'
        channels[name] = channel

    assessed = [k for k, v in channels.items() if v['state'] == 'present_assessed']
    g, i, s = (channels[k]['state'] for k in ('google', 'instagram', 'site'))
    scenario = None
    if s == 'absent_confirmed':
        if g == i == 'present_assessed':
            scenario = 'google_instagram_no_site'
        elif g == 'present_assessed' and i == 'absent_confirmed':
            scenario = 'google_only_no_site'
        elif i == 'present_assessed' and g == 'absent_confirmed':
            scenario = 'instagram_only_no_site'

    # Cobertura parcial preserva o canal analisado sem declarar ausências desconhecidas.
    pages = deepcopy(RULES['scenarios'][scenario]['pages']) if scenario else []
    if not scenario:
        warnings.append('Cobertura fora dos três cenários confirmados: planejar pelos canais observados e conferir os demais')
    eligibility = payload.get('google_eligibility', 'unknown')
    if eligibility not in ('eligible', 'ineligible', 'unknown'):
        raise ValueError('Elegibilidade Google inválida')
    google_action = 'preserve_or_improve' if g == 'present_assessed' else 'confirm_presence'
    if g == 'absent_confirmed':
        google_action = {'eligible': 'evaluate_profile_creation', 'ineligible': 'not_applicable',
                         'unknown': 'confirm_eligibility'}[eligibility]
    if scenario == 'instagram_only_no_site' and eligibility != 'eligible':
        pages[2] = {
            'title': 'Confiança e clareza no Instagram',
            'job': 'Aprofundar o canal observado',
            'content': 'Usar conteúdo e apresentação observados. Google não entra como recomendação de criação antes da confirmação de adequação.',
            'copy': 'O próximo passo é ajudar quem já chegou ao seu perfil a entender melhor seu trabalho e como entrar em contato.'
        }

    need = payload.get('site_need')
    site_action = 'evaluate_specific_need' if s == 'absent_confirmed' and need else 'no_automatic_site_offer'
    count = payload.get('distinct_supported_findings', 0)
    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
        raise ValueError('Quantidade inválida de achados')
    if count == 1 and pages:
        # O aprofundamento restante deve reunir as conclusões dos canais avaliados.
        pages[1]['content'] += ' Reunir aqui os pontos fortes e conclusões dos demais canais avaliados.'
        pages.pop(2)
    return {
        'scenario': scenario or 'partial_or_extended_coverage',
        'review_required': not scenario or count == 0,
        'coverage': {k: LABELS[v['state']] for k, v in channels.items()},
        'required_visible_channels': assessed,
        'instagram_required': i == 'present_assessed',
        'google_action': google_action,
        'site_action': site_action,
        'contact_destination': payload.get('contact_destination', 'unknown'),
        'pages': pages,
        'warnings': warnings,
    }
