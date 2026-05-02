import os
import psycopg2
import psycopg2.extras
from pgvector.psycopg2 import register_vector


def get_connection() -> psycopg2.extensions.connection:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    register_vector(conn)
    return conn


def fetch_user(conn: psycopg2.extensions.connection, user_id: int) -> dict | None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, name, age, gender_identity, gender_preference,
                   age_range_min, age_range_max, preferences,
                   home_base_latitude, home_base_longitude,
                   account_standing, is_open
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def fetch_all_active_users_with_embeddings(
    conn: psycopg2.extensions.connection,
) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, age, gender_identity, gender_preference,
                   age_range_min, age_range_max, embedding_vector
            FROM users
            WHERE account_standing = 'active'
              AND embedding_vector IS NOT NULL
            """
        )
        return [dict(row) for row in cur.fetchall()]


def write_embedding(
    conn: psycopg2.extensions.connection,
    user_id: int,
    vector: list[float],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE users
            SET embedding_vector = %s, embedding_updated_at = NOW()
            WHERE id = %s
            """,
            (vector, user_id),
        )
    conn.commit()


def upsert_match_pool(
    conn: psycopg2.extensions.connection,
    user_id: int,
    candidates: list[dict],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO match_pools (user_id, candidates, computed_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET candidates = EXCLUDED.candidates,
                          computed_at = EXCLUDED.computed_at
            """,
            (user_id, psycopg2.extras.Json(candidates)),
        )
    conn.commit()


def fetch_match_pool(
    conn: psycopg2.extensions.connection,
    user_id: int,
) -> list[dict] | None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT candidates FROM match_pools WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        return row["candidates"] if row else None
