import unittest
from planner import plan


def assessed():
    return {'state': 'present_assessed', 'evidence_refs': ['fixture:observacao']}


def absent():
    return {'state': 'absent_confirmed', 'confirmation': {
        'method': 'fixture', 'date': '2026-10-07', 'reference': 'fixture:confirmacao'}}


class ScenarioTests(unittest.TestCase):
    def payload(self, google, instagram):
        return {'channels': {'google': google, 'instagram': instagram, 'site': absent()},
                'distinct_supported_findings': 2, 'google_eligibility': 'eligible'}

    def test_three_confirmed_scenarios(self):
        for g, i, expected in [
            (assessed(), assessed(), 'google_instagram_no_site'),
            (assessed(), absent(), 'google_only_no_site'),
            (absent(), assessed(), 'instagram_only_no_site')]:
            with self.subTest(expected=expected):
                output = plan(self.payload(g, i))
                self.assertEqual(output['scenario'], expected)
                self.assertEqual(len(output['pages']), 5)

    def test_missing_google_does_not_mean_absent(self):
        for state in ['not_provided', 'not_found', 'collection_failed', 'restricted']:
            with self.subTest(state=state):
                p = plan(self.payload({'state': state}, assessed()))
                self.assertEqual(p['scenario'], 'partial_or_extended_coverage')
                self.assertEqual(p['google_action'], 'confirm_presence')

    def test_absence_requires_confirmation(self):
        p = plan(self.payload({'state': 'absent_confirmed'}, assessed()))
        self.assertEqual(p['coverage']['google'], 'Não informado')

    def test_assessed_requires_evidence(self):
        p = plan(self.payload(assessed(), {'state': 'present_assessed'}))
        self.assertFalse(p['instagram_required'])
        self.assertEqual(p['coverage']['instagram'], 'Identificado, a avaliar')

    def test_google_creation_requires_eligibility(self):
        for eligible, action in [('ineligible', 'not_applicable'), ('unknown', 'confirm_eligibility')]:
            data = self.payload(absent(), assessed())
            data['google_eligibility'] = eligible
            p = plan(data)
            self.assertEqual(p['google_action'], action)
            self.assertEqual(p['pages'][2]['title'], 'Confiança e clareza no Instagram')

    def test_no_automatic_site_offer_or_linktree_as_site(self):
        data = self.payload(assessed(), assessed())
        data['contact_destination'] = 'link_aggregator'
        p = plan(data)
        self.assertEqual(p['site_action'], 'no_automatic_site_offer')
        self.assertEqual(p['coverage']['site'], 'Ausência confirmada')
        data['channels']['site'] = {'state': 'not_provided'}
        self.assertEqual(plan(data)['coverage']['site'], 'Não informado')

    def test_one_finding_keeps_instagram_visible(self):
        data = self.payload(assessed(), assessed())
        data['distinct_supported_findings'] = 1
        p = plan(data)
        self.assertEqual(len(p['pages']), 4)
        self.assertTrue(p['instagram_required'])
        self.assertEqual(p['required_visible_channels'], ['google', 'instagram'])

    def test_zero_findings_requires_review(self):
        data = self.payload(assessed(), assessed())
        data['distinct_supported_findings'] = 0
        self.assertTrue(plan(data)['review_required'])


if __name__ == '__main__':
    unittest.main()
