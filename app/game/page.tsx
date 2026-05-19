import Link from "next/link";
import { GameCanvas } from "@/components/GameCanvas";
import styles from "./game.module.css";

export default function GamePage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <h1 className={styles.brand}>Kogniffy AI</h1>
          <Link className={styles.homeLink} href="/">
            Início
          </Link>
        </header>

        <section className={styles.stage} aria-label="Área do jogo">
          <GameCanvas className={styles.canvas} />
        </section>

        <section className={styles.help} aria-label="Controles">
          <div className={styles.helpItem}>Setas: mover o robô</div>
          <div className={styles.helpItem}>Encoste nos cristais corretos durante a fase de atenção</div>
          <div className={styles.helpItem}>Clique/toque: avançar falas e usar painéis</div>
        </section>

        <p className={styles.notice}>
          Esta experiência possui caráter apenas educativo e indicativo. Os resultados não representam diagnóstico clínico.
        </p>
      </div>
    </main>
  );
}
