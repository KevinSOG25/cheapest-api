#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════╗
║          Cheapest API — Script de Pruebas de Carga              ║
║          Endpoints: GET productos-disponibles / POST pedidos     ║
╚══════════════════════════════════════════════════════════════════╝

Dependencia única:
    pip install httpx

Ejemplos de uso:
    # Test GET con 50 usuarios, 30 s ramp-up, 60 s duración
    python load_test.py --endpoint GET --users 50 --ramp-up 30 --duration 60

    # Test POST con 100 usuarios, 50 s ramp-up, 60 s duración
    python load_test.py --endpoint POST --users 100 --ramp-up 50 --duration 60

    # Test POST con body externo
    python load_test.py --endpoint POST --users 100 --ramp-up 50 --duration 60 --body sample_body.json

    # Test de ambos endpoints en secuencia
    python load_test.py --endpoint BOTH --users 80 --ramp-up 40 --duration 60
"""

import argparse
import asyncio
import csv
import io
import json
import math
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

# Forzar UTF-8 en stdout para que los emojis y caracteres especiales funcionen en Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ─── Dependencia opcional: matplotlib ────────────────────────────────────────
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.gridspec as gridspec
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False

# ─── Dependencia requerida: httpx ────────────────────────────────────────────
try:
    import httpx
except ImportError:
    print("❌  Falta la librería 'httpx'. Instálala con:\n    pip install httpx")
    sys.exit(1)


# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN BASE
# ══════════════════════════════════════════════════════════════════════════════

BASE_URL = "http://localhost:3000"

# UUIDs fijos del seed.sql del proyecto (e2e-compatible)
_TIENDAS = [
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
]
_ZONAS = ["Zona Norte", "Zona Sur"]
_MONEDA_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

# Productos del seed — se mezclan para pedidos más realistas
_PRODUCTOS_SEED = [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad",
]

# Pool ampliado de productos: los 4 del seed + 22 UUIDs v4 fijos para completar > 20 ítems
_PRODUCTOS_POOL = _PRODUCTOS_SEED + [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
    "10000000-0000-4000-8000-000000000004",
    "10000000-0000-4000-8000-000000000005",
    "10000000-0000-4000-8000-000000000006",
    "10000000-0000-4000-8000-000000000007",
    "10000000-0000-4000-8000-000000000008",
    "10000000-0000-4000-8000-000000000009",
    "10000000-0000-4000-8000-000000000010",
    "10000000-0000-4000-8000-000000000011",
    "10000000-0000-4000-8000-000000000012",
    "10000000-0000-4000-8000-000000000013",
    "10000000-0000-4000-8000-000000000014",
    "10000000-0000-4000-8000-000000000015",
    "10000000-0000-4000-8000-000000000016",
    "10000000-0000-4000-8000-000000000017",
    "10000000-0000-4000-8000-000000000018",
    "10000000-0000-4000-8000-000000000019",
    "10000000-0000-4000-8000-000000000020",
    "10000000-0000-4000-8000-000000000021",
    "10000000-0000-4000-8000-000000000022",
]

REQUEST_TIMEOUT = 10.0  # segundos


# ══════════════════════════════════════════════════════════════════════════════
# GENERADORES DE BODY
# ══════════════════════════════════════════════════════════════════════════════

def _make_post_body(counter: int) -> dict:
    """Genera un body realista de pedido grande con 26 ítems (> 20)."""
    tienda_id = random.choice(_TIENDAS)
    productos = random.sample(_PRODUCTOS_POOL, k=min(26, len(_PRODUCTOS_POOL)))
    items = []
    monto_total = 0.0

    for i, prod_id in enumerate(productos):
        precio = round(random.uniform(5.0, 120.0), 2)
        cantidad = random.randint(1, 20)
        descuento = round(random.uniform(0, precio * 0.15), 2)
        monto_total += precio * cantidad - descuento
        lote_num = f"LOTE{counter:04d}-{i+1:02d}"
        items.append({
            "productoId":    prod_id,
            "cantidad":      cantidad,
            "precioUnitario": precio,
            "descuento":     descuento,
            "monedaId":      _MONEDA_ID,
            "lote":          lote_num,
            "fechaVencimiento": "2027-12-31",
        })

    return {
        "identificador":    f"LOAD-{counter:06d}-{int(time.time()*1000) % 100000}",
        "tiendaId":         tienda_id,
        "fechaHoraCreacion": datetime.now(timezone.utc).isoformat(),
        "montoTotal":       round(monto_total, 2),
        "monedaId":         _MONEDA_ID,
        "estado":           "creado",
        "items":            items,
    }


def _make_get_url() -> str:
    tienda_id = random.choice(_TIENDAS)
    zona = random.choice(_ZONAS)
    return f"{BASE_URL}/logistics/tenderos/productos-disponibles?tiendaId={tienda_id}&zona={zona}"


# ══════════════════════════════════════════════════════════════════════════════
# REGISTRO DE RESULTADOS
# ══════════════════════════════════════════════════════════════════════════════

class Result:
    __slots__ = ("timestamp_iso", "method", "endpoint", "status_code", "latency_ms", "error")

    def __init__(
        self,
        timestamp_iso: str,
        method: str,
        endpoint: str,
        status_code: Optional[int],
        latency_ms: float,
        error: str,
    ):
        self.timestamp_iso = timestamp_iso
        self.method = method
        self.endpoint = endpoint
        self.status_code = status_code
        self.latency_ms = latency_ms
        self.error = error


# ══════════════════════════════════════════════════════════════════════════════
# WORKER ASYNC
# ══════════════════════════════════════════════════════════════════════════════

_counter_lock = asyncio.Lock()
_global_counter = 0


async def _worker(
    client: httpx.AsyncClient,
    method: Literal["GET", "POST"],
    results: list,
    stop_event: asyncio.Event,
    external_body: Optional[dict],
) -> None:
    global _global_counter

    while not stop_event.is_set():
        async with _counter_lock:
            _global_counter += 1
            my_counter = _global_counter

        ts = datetime.now(timezone.utc).isoformat()
        t0 = time.perf_counter()
        status_code: Optional[int] = None
        error = ""

        try:
            if method == "GET":
                url = _make_get_url()
                endpoint_label = "/logistics/tenderos/productos-disponibles"
                resp = await client.get(url, timeout=REQUEST_TIMEOUT)
            else:
                body = external_body if external_body else _make_post_body(my_counter)
                url = f"{BASE_URL}/logistics/pedidos"
                endpoint_label = "/logistics/pedidos"
                resp = await client.post(url, json=body, timeout=REQUEST_TIMEOUT)

            status_code = resp.status_code
            if status_code >= 400:
                try:
                    err_body = resp.json()
                    error = str(err_body.get("message", resp.text[:120]))
                except Exception:
                    error = resp.text[:120]

        except httpx.TimeoutException:
            error = "TIMEOUT"
            endpoint_label = (
                "/logistics/tenderos/productos-disponibles" if method == "GET"
                else "/logistics/pedidos"
            )
        except httpx.ConnectError:
            error = "CONNECTION_ERROR"
            endpoint_label = (
                "/logistics/tenderos/productos-disponibles" if method == "GET"
                else "/logistics/pedidos"
            )
        except Exception as exc:
            error = f"UNEXPECTED:{type(exc).__name__}:{str(exc)[:80]}"
            endpoint_label = (
                "/logistics/tenderos/productos-disponibles" if method == "GET"
                else "/logistics/pedidos"
            )

        latency_ms = (time.perf_counter() - t0) * 1000.0

        results.append(Result(
            timestamp_iso=ts,
            method=method,
            endpoint=endpoint_label,
            status_code=status_code,
            latency_ms=round(latency_ms, 3),
            error=error,
        ))


# ══════════════════════════════════════════════════════════════════════════════
# ORQUESTADOR PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

async def run_load_test(
    method: Literal["GET", "POST"],
    users: int,
    ramp_up: float,
    duration: float,
    external_body: Optional[dict] = None,
) -> list:
    """
    Arranca `users` workers de forma progresiva durante `ramp_up` segundos
    y los detiene transcurridos `duration` segundos desde el inicio.
    """
    global _global_counter
    _global_counter = 0

    results = []
    stop_event = asyncio.Event()
    tasks = []

    limits = httpx.Limits(
        max_connections=users + 20,
        max_keepalive_connections=users,
    )

    # Intervalo entre el arranque de cada worker
    ramp_interval = ramp_up / users if users > 1 else 0

    start_ts = time.perf_counter()

    async with httpx.AsyncClient(limits=limits) as client:

        async def _spawn_workers():
            for i in range(users):
                if stop_event.is_set():
                    break
                task = asyncio.create_task(
                    _worker(client, method, results, stop_event, external_body)
                )
                tasks.append(task)
                if ramp_interval > 0 and i < users - 1:
                    await asyncio.sleep(ramp_interval)

        spawn_task = asyncio.create_task(_spawn_workers())

        # Esperar hasta que expire la duración
        remaining = duration - (time.perf_counter() - start_ts)
        if remaining > 0:
            await asyncio.sleep(remaining)

        # Señal de parada
        stop_event.set()
        spawn_task.cancel()

        # Esperar a que todos los workers terminen su request en curso
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    return results


# ══════════════════════════════════════════════════════════════════════════════
# MÉTRICAS
# ══════════════════════════════════════════════════════════════════════════════

def _percentile(sorted_values: list, p: float) -> float:
    if not sorted_values:
        return 0.0
    idx = math.ceil(p / 100 * len(sorted_values)) - 1
    return sorted_values[max(0, idx)]


def compute_metrics(results: list, method: str, duration: float) -> dict:
    if not results:
        return {}

    latencies = sorted(r.latency_ms for r in results)
    errors = [
        r for r in results
        if r.error or (r.status_code is not None and r.status_code >= 400)
    ]

    total = len(results)
    error_count = len(errors)
    avg_lat = sum(latencies) / total if total else 0

    times = [
        datetime.fromisoformat(r.timestamp_iso).timestamp()
        for r in results
    ]
    actual_duration = max(max(times) - min(times), 0.001) if len(times) > 1 else duration

    return {
        "method":        method,
        "total":         total,
        "errors":        error_count,
        "error_pct":     round(error_count / total * 100, 2) if total else 0,
        "throughput":    round(total / actual_duration, 2),
        "avg_ms":        round(avg_lat, 2),
        "p95_ms":        round(_percentile(latencies, 95), 2),
        "p99_ms":        round(_percentile(latencies, 99), 2),
        "min_ms":        round(latencies[0], 2) if latencies else 0,
        "max_ms":        round(latencies[-1], 2) if latencies else 0,
    }


# ══════════════════════════════════════════════════════════════════════════════
# EXPORTAR CSV
# ══════════════════════════════════════════════════════════════════════════════

def export_csv(results: list, filepath: str) -> None:
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp_iso", "method", "endpoint", "status_code", "latency_ms", "error"])
        for r in results:
            writer.writerow([
                r.timestamp_iso,
                r.method,
                r.endpoint,
                r.status_code if r.status_code is not None else "",
                r.latency_ms,
                r.error,
            ])


# ══════════════════════════════════════════════════════════════════════════════
# GRÁFICOS
# ══════════════════════════════════════════════════════════════════════════════

def generate_charts(results_map: dict, out_dir: str) -> None:
    """Genera gráficos de latencia y throughput para cada método."""
    if not HAS_MATPLOTLIB:
        print("\n⚠️  matplotlib no está instalado. Omitiendo generación de gráficos.")
        print("   Instala con: pip install matplotlib")
        return

    os.makedirs(out_dir, exist_ok=True)
    palette = {"GET": "#4C9BE8", "POST": "#E8734C"}

    for method, results in results_map.items():
        if not results:
            continue

        color = palette.get(method, "#888888")

        sorted_results = sorted(results, key=lambda r: r.timestamp_iso)
        t0 = datetime.fromisoformat(sorted_results[0].timestamp_iso).timestamp()
        times_s = [
            datetime.fromisoformat(r.timestamp_iso).timestamp() - t0
            for r in sorted_results
        ]
        latencies = [r.latency_ms for r in sorted_results]

        max_t = math.ceil(max(times_s)) if times_s else 1
        buckets: dict = {}
        for t in times_s:
            b = int(t)
            buckets[b] = buckets.get(b, 0) + 1
        bucket_keys = list(range(max_t + 1))
        bucket_vals = [buckets.get(k, 0) for k in bucket_keys]

        fig = plt.figure(figsize=(16, 10), facecolor="#0D1117")
        fig.suptitle(
            f"Resultados de Prueba de Carga — {method}",
            fontsize=16, fontweight="bold", color="white", y=0.98
        )

        gs = gridspec.GridSpec(2, 2, figure=fig, hspace=0.42, wspace=0.35)

        ax_lat_ts  = fig.add_subplot(gs[0, 0])
        ax_hist    = fig.add_subplot(gs[0, 1])
        ax_tput    = fig.add_subplot(gs[1, 0])
        ax_summary = fig.add_subplot(gs[1, 1])

        _style_ax(ax_lat_ts)
        _style_ax(ax_hist)
        _style_ax(ax_tput)
        ax_summary.axis("off")
        ax_summary.set_facecolor("#161B22")

        # 1) Latencia a lo largo del tiempo
        ax_lat_ts.scatter(times_s, latencies, s=3, alpha=0.4, color=color, rasterized=True)
        sorted_lat = sorted(latencies)
        p95 = _percentile(sorted_lat, 95)
        p99 = _percentile(sorted_lat, 99)
        ax_lat_ts.axhline(p95, color="#F0C040", linewidth=1.2, linestyle="--", label=f"p95 = {p95:.1f} ms")
        ax_lat_ts.axhline(p99, color="#E05252", linewidth=1.2, linestyle="--", label=f"p99 = {p99:.1f} ms")
        ax_lat_ts.set_xlabel("Tiempo (s)", color="white", fontsize=9)
        ax_lat_ts.set_ylabel("Latencia (ms)", color="white", fontsize=9)
        ax_lat_ts.set_title("Latencia por Request en el Tiempo", color="white", fontsize=10)
        ax_lat_ts.legend(fontsize=8, facecolor="#1E2533", labelcolor="white")

        # 2) Histograma de latencias
        ax_hist.hist(latencies, bins=40, color=color, alpha=0.85, edgecolor="#0D1117")
        ax_hist.axvline(p95, color="#F0C040", linewidth=1.5, linestyle="--", label="p95")
        ax_hist.axvline(p99, color="#E05252", linewidth=1.5, linestyle="--", label="p99")
        ax_hist.set_xlabel("Latencia (ms)", color="white", fontsize=9)
        ax_hist.set_ylabel("Frecuencia", color="white", fontsize=9)
        ax_hist.set_title("Distribución de Latencias", color="white", fontsize=10)
        ax_hist.legend(fontsize=8, facecolor="#1E2533", labelcolor="white")

        # 3) Throughput por segundo
        ax_tput.bar(bucket_keys, bucket_vals, color=color, alpha=0.85, width=0.8)
        avg_tput = sum(bucket_vals) / len(bucket_vals) if bucket_vals else 0
        ax_tput.axhline(avg_tput, color="#7EE8A2", linewidth=1.5, linestyle="--",
                        label=f"Promedio = {avg_tput:.1f} req/s")
        ax_tput.set_xlabel("Tiempo (s)", color="white", fontsize=9)
        ax_tput.set_ylabel("Requests / segundo", color="white", fontsize=9)
        ax_tput.set_title("Throughput por Segundo", color="white", fontsize=10)
        ax_tput.legend(fontsize=8, facecolor="#1E2533", labelcolor="white")

        # 4) Tabla de resumen
        errors_count = sum(
            1 for r in results
            if r.error or (r.status_code is not None and r.status_code >= 400)
        )
        total_req = len(results)
        summary_data = [
            ["Total Requests",    str(total_req)],
            ["Errores",           f"{errors_count} ({errors_count/total_req*100:.1f}%)"],
            ["Throughput",        f"{avg_tput:.2f} req/s"],
            ["Latencia Promedio", f"{sum(latencies)/len(latencies):.2f} ms"],
            ["p95",               f"{p95:.2f} ms"],
            ["p99",               f"{p99:.2f} ms"],
            ["Min",               f"{min(latencies):.2f} ms"],
            ["Max",               f"{max(latencies):.2f} ms"],
        ]
        tbl = ax_summary.table(
            cellText=summary_data,
            colLabels=["Métrica", "Valor"],
            loc="center",
            cellLoc="left",
        )
        tbl.auto_set_font_size(False)
        tbl.set_fontsize(10)
        tbl.scale(1, 1.6)
        for (row, col), cell in tbl.get_celld().items():
            cell.set_facecolor("#1E2533" if row % 2 == 0 else "#161B22")
            cell.set_text_props(color="white")
            cell.set_edgecolor("#30363D")
        ax_summary.set_title("Resumen de Métricas", color="white", fontsize=10, pad=10)

        out_path = os.path.join(out_dir, f"chart_{method.lower()}.png")
        plt.savefig(out_path, dpi=150, bbox_inches="tight", facecolor="#0D1117")
        plt.close(fig)
        print(f"   [PNG] Grafico guardado --> {out_path}")


def _style_ax(ax) -> None:
    ax.set_facecolor("#161B22")
    ax.tick_params(colors="white", labelsize=8)
    ax.spines[:].set_color("#30363D")
    for label in ax.get_xticklabels() + ax.get_yticklabels():
        label.set_color("white")


# ══════════════════════════════════════════════════════════════════════════════
# IMPRESIÓN DE RESUMEN
# ══════════════════════════════════════════════════════════════════════════════

def print_summary(metrics_list: list, users: int, ramp_up: float, duration: float) -> None:
    sep = "═" * 62
    print(f"\n{sep}")
    print("  RESUMEN DE PRUEBA DE CARGA — Cheapest API")
    print(sep)
    print(f"  Usuarios (concurrencia)  : {users}")
    print(f"  Ramp-up                  : {ramp_up} s")
    print(f"  Duración                 : {duration} s")
    print()

    for m in metrics_list:
        if not m:
            continue
        method = m["method"]
        print(f"  ── {method} {'─'*(56-len(method))}")
        print(f"  {'Total requests':<28}: {m['total']:>8}")
        print(f"  {'Errores':<28}: {m['errors']:>8}  ({m['error_pct']} %)")
        print(f"  {'Throughput':<28}: {m['throughput']:>8.2f} req/s")
        print(f"  {'Latencia promedio':<28}: {m['avg_ms']:>8.2f} ms")
        print(f"  {'Latencia p95':<28}: {m['p95_ms']:>8.2f} ms")
        print(f"  {'Latencia p99':<28}: {m['p99_ms']:>8.2f} ms")
        print(f"  {'Latencia mínima':<28}: {m['min_ms']:>8.2f} ms")
        print(f"  {'Latencia máxima':<28}: {m['max_ms']:>8.2f} ms")
        print()

    print(sep)


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pruebas de carga para Cheapest API (NestJS)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--endpoint", "-e",
        choices=["GET", "POST", "BOTH"],
        default="BOTH",
        help="Endpoint a testear: GET, POST o BOTH (default: BOTH)",
    )
    parser.add_argument(
        "--users", "-u",
        type=int,
        default=50,
        help="Número máximo de usuarios concurrentes (default: 50)",
    )
    parser.add_argument(
        "--ramp-up", "-r",
        type=float,
        default=30.0,
        dest="ramp_up",
        help="Segundos de ramp-up para llegar a la concurrencia máxima (default: 30)",
    )
    parser.add_argument(
        "--duration", "-d",
        type=float,
        default=60.0,
        help="Duración total de la prueba en segundos (default: 60)",
    )
    parser.add_argument(
        "--body", "-b",
        type=str,
        default=None,
        help="Ruta a un JSON con el body para POST (si no se provee, se genera automáticamente)",
    )
    parser.add_argument(
        "--out-dir", "-o",
        type=str,
        default="load_test_results",
        help="Directorio de salida para CSV y gráficos (default: load_test_results/)",
    )
    parser.add_argument(
        "--no-charts",
        action="store_true",
        help="Omitir generación de gráficos aunque matplotlib esté disponible",
    )
    return parser.parse_args()


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

async def main() -> None:
    args = parse_args()

    # Cargar body externo si se proveyó
    external_body: Optional[dict] = None
    if args.body:
        body_path = Path(args.body)
        if not body_path.exists():
            print(f"❌  No se encontró el archivo de body: {body_path}")
            sys.exit(1)
        with open(body_path, encoding="utf-8") as f:
            external_body = json.load(f)
        items = external_body.get("items", [])
        print(f"✅  Body externo cargado: {len(items)} ítems")
        if len(items) < 20:
            print("⚠️  Advertencia: el body tiene menos de 20 ítems.")

    os.makedirs(args.out_dir, exist_ok=True)

    methods = (
        ["GET", "POST"] if args.endpoint == "BOTH"
        else [args.endpoint]
    )

    all_results: dict = {}
    all_metrics: list = []

    for method in methods:
        print(f"\n{'='*62}")
        print(f"  [>>] Iniciando prueba {method}")
        print(f"       Usuarios: {args.users}  |  Ramp-up: {args.ramp_up}s  |  Duracion: {args.duration}s")
        print(f"{'='*62}")

        test_start = time.perf_counter()
        results = await run_load_test(
            method=method,
            users=args.users,
            ramp_up=args.ramp_up,
            duration=args.duration,
            external_body=external_body if method == "POST" else None,
        )
        elapsed = time.perf_counter() - test_start

        print(f"  [OK] Prueba {method} finalizada en {elapsed:.1f}s -- {len(results)} requests registradas")

        # Guardar CSV
        csv_name = f"results_{method.lower()}.csv"
        csv_path = os.path.join(args.out_dir, csv_name)
        export_csv(results, csv_path)
        print(f"  [CSV] Exportado --> {csv_path}")

        all_results[method] = results
        metrics = compute_metrics(results, method, args.duration)
        all_metrics.append(metrics)

    # Resumen en consola
    print_summary(all_metrics, args.users, args.ramp_up, args.duration)

    # Gráficos
    if not args.no_charts:
        print("  Generando graficos...")
        generate_charts(all_results, args.out_dir)

    print(f"\n  [DIR] Todos los resultados en: {os.path.abspath(args.out_dir)}\n")


if __name__ == "__main__":
    asyncio.run(main())
