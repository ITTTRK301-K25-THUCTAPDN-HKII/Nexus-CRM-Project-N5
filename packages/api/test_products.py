import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as api


class ProductApiTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    def authenticate(self, role="Manager", user_id=9):
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

    def test_authenticated_users_can_list_products_with_filters(self):
        sale = self.authenticate("Sale", 8)
        with patch.object(api, "query", side_effect=[[sale], [{"id": 2, "sku": "SVC-1"}]]) as mocked:
            response = self.client.get("/api/products?active=true&search=service")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["products"], [{"id": 2, "sku": "SVC-1"}])
        self.assertIn("is_active=%s", mocked.call_args_list[1].args[0])
        self.assertEqual(mocked.call_args_list[1].args[1], (True, "%service%", "%service%"))

    def test_product_create_requires_manager_or_admin_and_valid_data(self):
        self.authenticate("Sale", 8)
        with patch.object(api, "query", return_value=[{
            "id": 8, "name": "Test Sale", "email": "sale@test.local", "role": "Sale", "status": "ACTIVE",
        }]):
            denied = self.client.post("/api/products", json={"sku": "SKU-1", "name": "Product", "unitPrice": 10})
        self.assertEqual(denied.status_code, 403)

        self.authenticate()
        with patch.object(api, "query", return_value=[{
            "id": 9, "name": "Test Manager", "email": "manager@test.local", "role": "Manager", "status": "ACTIVE",
        }]):
            invalid = self.client.post("/api/products", json={"sku": "SKU-1", "name": "Product", "unitPrice": -1})
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("errors", invalid.json)

        self.authenticate()
        with patch.object(api, "query", return_value=[{
            "id": 9, "name": "Test Manager", "email": "manager@test.local", "role": "Manager", "status": "ACTIVE",
        }]):
            too_precise = self.client.post(
                "/api/products",
                json={"sku": "SKU-1", "name": "Product", "unitPrice": "1e-10000"},
            )
        self.assertEqual(too_precise.status_code, 400)

    def test_product_create_and_duplicate_sku_response(self):
        self.authenticate()
        product = {"id": 12, "sku": "SKU-1", "name": "Service", "unitPrice": 25.5, "currency": "USD"}
        with patch.object(api, "query", side_effect=[[
            {"id": 9, "name": "Test Manager", "email": "manager@test.local", "role": "Manager", "status": "ACTIVE"},
        ], [product]]), patch.object(
            api, "execute", return_value=(12, 1)
        ) as execute:
            response = self.client.post(
                "/api/products",
                json={"sku": "sku-1", "name": "Service", "unitPrice": "25.50"},
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["product"], product)
        self.assertEqual(execute.call_args.args[1][0], "SKU-1")

        self.authenticate()
        duplicate = api.IntegrityError(errno=api.errorcode.ER_DUP_ENTRY)
        with patch.object(api, "query", return_value=[{
            "id": 9, "name": "Test Manager", "email": "manager@test.local", "role": "Manager", "status": "ACTIVE",
        }]), patch.object(
            api, "execute", side_effect=duplicate
        ):
            response = self.client.post(
                "/api/products",
                json={"sku": "sku-1", "name": "Service", "unitPrice": 25},
            )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json["code"], "DUPLICATE_SKU")

    def test_product_update_returns_existing_product_when_values_are_unchanged(self):
        self.authenticate()
        product = {"id": 12, "sku": "SKU-1", "name": "Service", "unitPrice": 25.5, "currency": "USD"}
        with patch.object(
            api,
            "query",
            side_effect=[
                [{"id": 9, "name": "Test Manager", "email": "manager@test.local", "role": "Manager", "status": "ACTIVE"}],
                [{"id": 12}],
                [product],
            ],
        ), patch.object(api, "execute", return_value=(0, 0)):
            response = self.client.patch("/api/products/12", json={"name": "Service"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["product"], product)

    def test_product_delete_prevents_removing_items_used_by_quotes(self):
        self.authenticate()

        class FakeCursor:
            def __init__(self):
                self.results = [{"id": 4}, {"id": 20}]
                self.statements = []

            def execute(self, statement, values):
                self.statements.append((statement, values))

            def fetchone(self):
                return self.results.pop(0)

        cursor = FakeCursor()
        with patch.object(api, "query", return_value=[{
            "id": 9, "name": "Test Manager", "email": "manager@test.local", "role": "Manager", "status": "ACTIVE",
        }]), patch.object(
            api, "transaction", side_effect=lambda work: work(cursor)
        ):
            response = self.client.delete("/api/products/4")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json["code"], "PRODUCT_IN_USE")
        self.assertFalse(any(statement.startswith("DELETE") for statement, _ in cursor.statements))

    def test_product_delete_succeeds_when_not_used_by_a_quote(self):
        self.authenticate()

        class FakeCursor:
            def __init__(self):
                self.results = [{"id": 4}, None]
                self.deleted = False

            def execute(self, statement, _values):
                if statement.startswith("DELETE"):
                    self.deleted = True

            def fetchone(self):
                return self.results.pop(0)

        cursor = FakeCursor()
        with patch.object(api, "query", return_value=[{
            "id": 9, "name": "Test Manager", "email": "manager@test.local", "role": "Manager", "status": "ACTIVE",
        }]), patch.object(
            api, "transaction", side_effect=lambda work: work(cursor)
        ):
            response = self.client.delete("/api/products/4")
        self.assertEqual(response.status_code, 204)
        self.assertTrue(cursor.deleted)

    def test_managers_can_fetch_active_sale_assignees(self):
        manager = self.authenticate()
        sales = [{"id": 8, "name": "Sale One", "email": "sale@test.local"}]
        with patch.object(api, "query", side_effect=[[manager], sales]):
            response = self.client.get("/api/tasks/assignees")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["users"], sales)


if __name__ == "__main__":
    unittest.main()
