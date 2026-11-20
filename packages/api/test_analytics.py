import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as api


class SalesAnalyticsApiTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    def authenticate(self, role="Sale", user_id=8):
        user = {
            "id": user_id,
            "name": f"Test {role}",
            "email": f"{role.lower()}@test.local",
            "role": role,
            "status": "ACTIVE",
        }
        token = api.jwt.encode(
            {
                "sub": str(user_id),
                "role": role,
                "iss": "nexus-crm",
                "aud": "nexus-web",
                "iat": datetime.now(timezone.utc),
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            },
            api.JWT_SECRET,
            algorithm="HS256",
        )
        self.client.set_cookie("nexus_access", token)
        return user

    def test_kpis_are_scoped_by_role_and_do_not_mix_currency_totals(self):
        sale = self.authenticate()
        deal_rows = [
            {
                "currency": "USD", "totalDeals": 4, "openDeals": 2,
                "wonDeals": 1, "lostDeals": 1,
                "pipelineValue": Decimal("125.50"), "wonValue": Decimal("80.00"),
            },
            {
                "currency": "VND", "totalDeals": 1, "openDeals": 1,
                "wonDeals": 0, "lostDeals": 0,
                "pipelineValue": Decimal("1000000.00"), "wonValue": Decimal("0.00"),
            },
        ]
        lead_rows = [{"totalLeads": 10, "convertedLeads": 3}]
        with patch.object(api, "get_user", return_value=sale), patch.object(
            api, "query", side_effect=[deal_rows, lead_rows]
        ) as query:
            response = self.client.get("/api/analytics/kpis?from=2026-01-01&to=2026-01-31")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["period"], {"from": "2026-01-01", "to": "2026-01-31"})
        self.assertEqual(response.json["deals"], {
            "total": 5, "open": 3, "won": 1, "lost": 1, "winRate": 50.0,
        })
        self.assertEqual(response.json["leads"], {
            "total": 10, "converted": 3, "conversionRate": 30.0,
        })
        self.assertEqual(
            [row["currency"] for row in response.json["revenueByCurrency"]],
            ["USD", "VND"],
        )
        self.assertIn("d.owner_user_id = %s", query.call_args_list[0].args[0])
        self.assertEqual(
            query.call_args_list[0].args[1],
            (sale["id"], date(2026, 1, 1), date(2026, 2, 1)),
        )
        self.assertIn("l.deleted_at IS NULL", query.call_args_list[1].args[0])
        self.assertEqual(
            query.call_args_list[1].args[1],
            (date(2026, 1, 1), date(2026, 2, 1), sale["id"]),
        )

    def test_funnel_returns_all_lead_and_deal_stages_with_rates(self):
        sale = self.authenticate()
        deal_rows = [
            {"stage": "PROSPECTING", "currency": "USD", "dealCount": 2, "stageValue": Decimal("90.00")},
            {"stage": "WON", "currency": "USD", "dealCount": 1, "stageValue": Decimal("40.00")},
            {"stage": "LOST", "currency": "VND", "dealCount": 1, "stageValue": Decimal("500.00")},
        ]
        lead_rows = [
            {"status": "NEW", "leadCount": 2},
            {"status": "CONVERTED", "leadCount": 1},
            {"status": "UNQUALIFIED", "leadCount": 1},
        ]
        with patch.object(api, "get_user", return_value=sale), patch.object(
            api, "query", side_effect=[deal_rows, lead_rows]
        ):
            response = self.client.get("/api/analytics/funnel")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["totals"], {
            "leads": 4, "deals": 4, "wonDeals": 1, "lostDeals": 1,
        })
        self.assertEqual(response.json["conversion"], {"leads": 25.0, "deals": 50.0})
        self.assertEqual(response.json["leadFunnel"][0]["sharePercent"], 50.0)
        self.assertEqual(response.json["dealFunnel"][0]["count"], 2)
        won_stage = next(stage for stage in response.json["dealFunnel"] if stage["stage"] == "WON")
        self.assertEqual(won_stage["amountByCurrency"], [{"currency": "USD", "amount": 40.0}])
        self.assertEqual(len(response.json["dealFunnel"]), len(api.ANALYTICS_DEAL_STAGES))
        self.assertEqual(len(response.json["leadFunnel"]), len(api.ANALYTICS_LEAD_STAGES))

    def test_analytics_rejects_invalid_or_reversed_date_ranges_before_querying(self):
        self.authenticate()
        with patch.object(api, "get_user", return_value={
            "id": 8, "role": "Sale", "status": "ACTIVE",
        }), patch.object(
            api, "query"
        ) as query:
            invalid = self.client.get("/api/analytics/kpis?from=2026-02-30")
            reversed_range = self.client.get(
                "/api/analytics/funnel?from=2026-02-02&to=2026-02-01"
            )
            unknown_filter = self.client.get("/api/analytics/kpis?currency=USD")

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(reversed_range.status_code, 400)
        self.assertEqual(unknown_filter.status_code, 400)
        query.assert_not_called()

    def test_analytics_requires_authentication(self):
        for endpoint in ("/api/analytics/kpis", "/api/analytics/funnel"):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.client.get(endpoint).status_code, 401)

    def test_sales_performance_groups_results_and_filters_by_requested_quarter(self):
        manager = self.authenticate(role="Manager", user_id=3)
        deal_rows = [
            {
                "saleId": 8, "saleName": "Sale A", "currency": "USD",
                "dealsCreated": 3, "openDealsCreated": 1, "wonDealsClosed": 2,
                "lostDealsClosed": 1, "wonAmount": Decimal("1500.50"),
            },
            {
                "saleId": 8, "saleName": "Sale A", "currency": "VND",
                "dealsCreated": 1, "openDealsCreated": 1, "wonDealsClosed": 0,
                "lostDealsClosed": 0, "wonAmount": Decimal("0"),
            },
            {
                "saleId": 9, "saleName": "Sale B", "currency": None,
                "dealsCreated": 0, "openDealsCreated": 0, "wonDealsClosed": 0,
                "lostDealsClosed": 0, "wonAmount": Decimal("0"),
            },
        ]
        lead_rows = [
            {"saleId": 8, "leadsCreated": 4, "convertedLeads": 2},
            {"saleId": 9, "leadsCreated": 0, "convertedLeads": 0},
        ]
        with patch.object(api, "get_user", return_value=manager), patch.object(
            api, "query", side_effect=[deal_rows, lead_rows]
        ) as query:
            response = self.client.get(
                "/api/analytics/sales-performance?period=quarter&date=2026-11-18"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["period"], {
            "type": "quarter", "date": "2026-11-18", "from": "2026-10-01", "to": "2026-12-31",
        })
        sale_a, sale_b = response.json["sales"]
        self.assertEqual(sale_a["saleName"], "Sale A")
        self.assertEqual(sale_a["deals"], {
            "created": 4, "openCreated": 2, "wonClosed": 2, "lostClosed": 1, "winRate": 66.67,
        })
        self.assertEqual(sale_a["leads"], {
            "created": 4, "converted": 2, "conversionRate": 50.0,
        })
        self.assertEqual([item["currency"] for item in sale_a["revenueByCurrency"]], ["USD", "VND"])
        self.assertEqual(sale_b["deals"]["created"], 0)
        self.assertEqual(sale_b["leads"]["conversionRate"], 0.0)
        self.assertIn("u.role='Sale'", query.call_args_list[0].args[0])
        self.assertEqual(query.call_args_list[0].args[1], (
            date(2026, 10, 1), date(2027, 1, 1), date(2026, 10, 1), date(2027, 1, 1),
            date(2026, 10, 1), date(2027, 1, 1), date(2026, 10, 1), date(2027, 1, 1),
            date(2026, 10, 1), date(2027, 1, 1),
        ))

    def test_sales_performance_supports_day_week_and_month_boundaries(self):
        self.authenticate(role="Manager", user_id=3)
        expected = {
            "day": ("2026-11-18", "2026-11-18"),
            "week": ("2026-11-16", "2026-11-22"),
            "month": ("2026-11-01", "2026-11-30"),
        }
        for period, (start, end) in expected.items():
            manager = {"id": 3, "role": "Manager", "status": "ACTIVE"}
            with self.subTest(period=period), patch.object(api, "get_user", return_value=manager), patch.object(
                api, "query", side_effect=[[], []]
            ):
                response = self.client.get(
                    f"/api/analytics/sales-performance?period={period}&date=2026-11-18"
                )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["period"]["from"], start)
            self.assertEqual(response.json["period"]["to"], end)

    def test_sales_performance_is_manager_or_admin_only_and_validates_filters(self):
        self.authenticate(role="Sale", user_id=8)
        sale = {"id": 8, "role": "Sale", "status": "ACTIVE"}
        manager = {"id": 3, "role": "Manager", "status": "ACTIVE"}
        with patch.object(api, "get_user", return_value=sale):
            forbidden = self.client.get("/api/analytics/sales-performance")
        with patch.object(api, "get_user", return_value=manager), patch.object(api, "query") as query:
            invalid_period = self.client.get("/api/analytics/sales-performance?period=year")
            invalid_date = self.client.get("/api/analytics/sales-performance?date=2026-02-30")
            unknown_filter = self.client.get("/api/analytics/sales-performance?period=month&currency=USD")

        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(invalid_period.status_code, 400)
        self.assertEqual(invalid_date.status_code, 400)
        self.assertEqual(unknown_filter.status_code, 400)
        query.assert_not_called()


if __name__ == "__main__":
    unittest.main()
