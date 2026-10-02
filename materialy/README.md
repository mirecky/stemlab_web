# materialy.stemlab.sk

Verejný prehliadač žiackych materiálov. Súbory sú v súkromnom **Cloudflare R2** buckete
`stemlab-materialy` a malý **Cloudflare Worker** ich zobrazuje ako zložky a súbory.

- **Žiaci** iba čítajú a sťahujú. Worker nemá žiadnu cestu na zápis a nič sa nedá nahrať ani zmazať.
- **Nahrávate iba vy**, a to cez `rclone` (skript `scripts/nahraj.sh`) alebo cez Cloudflare dashboard.
- Súbory a zložky začínajúce bodkou (`.nieco`) sú skryté.
- Raspberry Pi a tunel pre `stemlab.sk` zostávajú bez zmeny, toto beží celé na Cloudflare.

Free tier stačí s rezervou: R2 má 10 GB úložiska zadarmo a sťahovanie bez poplatkov, Workers 100 000 požiadaviek denne.

## 1. Jednorazové nastavenie

1. **Bucket:** Cloudflare dashboard → R2 → *Create bucket* → názov `stemlab-materialy`.
   Verejný prístup (*Public access*) **nezapínajte**, súbory sprístupňuje Worker.
2. **Deploy Workera** (z počítača alebo Raspberry Pi, potrebný je Node.js 20+):
   ```bash
   cd materialy
   npm install
   npx wrangler login
   npx wrangler deploy
   ```
   Deploy sám vytvorí DNS záznam a certifikát pre `materialy.stemlab.sk`.
   > Ak máte v tuneli wildcard `*.stemlab.sk` alebo už existuje DNS záznam `materialy`,
   > najprv ho v DNS zmažte, inak deploy skončí chybou.
3. **API kľúč na nahrávanie:** R2 → *Manage R2 API Tokens* → *Create API token*.
   Oprávnenie *Object Read & Write*, obmedziť len na bucket `stemlab-materialy`.
   Poznačte si *Access Key ID*, *Secret Access Key* a *Account ID*.
4. **rclone** (`sudo apt install rclone` alebo <https://rclone.org/downloads/>).
   Do `~/.config/rclone/rclone.conf` pridajte:
   ```ini
   [r2]
   type = s3
   provider = Cloudflare
   access_key_id = VAS_ACCESS_KEY_ID
   secret_access_key = VAS_SECRET_ACCESS_KEY
   endpoint = https://VAS_ACCOUNT_ID.r2.cloudflarestorage.com
   no_check_bucket = true
   ```

## 2. Presun materiálov z MEGA

1. Otvorte zložku na mega.nz → *Stiahnuť* → *Stiahnuť ako ZIP* a rozbaľte ju napr. do `~/Materialy`.
   (Na Raspberry Pi to ide aj bez prehliadača: `sudo apt install megatools` a potom
   `megadl --path ~/Materialy 'https://mega.nz/folder/...'`.)
2. Skontrolujte, čo sa nahrá, a potom nahrajte:
   ```bash
   ./scripts/nahraj.sh ~/Materialy           # len náhľad
   ./scripts/nahraj.sh ~/Materialy --naozaj  # nahranie
   ```

## 3. Bežné používanie

Upravte súbory v `~/Materialy` (pridať, premenovať, zmazať) a spustite
`./scripts/nahraj.sh ~/Materialy --naozaj`. Web sa zmení do minúty.

`sync` zrkadlí priečinok: čo zmažete lokálne, zmizne aj z webu.

Jednotlivý súbor sa dá nahrať aj cez dashboard (R2 → bucket → *Upload*, max. 300 MB na súbor).
Zložku tam vytvoríte cez *Add directory*.

## Lokálne testovanie

```bash
npx wrangler dev      # http://localhost:8787 nad lokálnym (prázdnym) bucketom
```
