import styles from "./game.module.css";

export default function Loading() {
  return (
    <main className={styles.page}>
      <div className={styles.loadingShell}>
        <section className={styles.loadingCard} aria-live="polite" aria-busy="true">
          <div className={styles.loadingDots} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1 className={styles.loadingTitle}>Carregando o jogo</h1>
          <p className={styles.loadingText}>Preparando as fases e os painéis interativos.</p>
        </section>
      </div>
    </main>
  );
}
