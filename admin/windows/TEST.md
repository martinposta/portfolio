# Test adminu na Windows (fáze 8A)

Projděte body po pořadí. U každého je napsané, co má nastat. Když něco
nesedí, spusťte `admin\windows\diagnose.bat` a pošlete Claudovi obsah
souboru `portfolio-diagnostika.txt` z plochy spolu s popisem, u kterého
bodu to bylo.

## 1. Instalace
1. Spusťte `setup-windows.bat` (dvojklikem).
   - Windows může ukázat „Systém Windows ochránil váš počítač“:
     **Další informace → Přesto spustit**. Soubor je z vašeho repa.
   - Při instalaci Gitu a Node.js se Windows zeptá na povolení: **Ano**.
   - Otevře se okno GitHubu k přihlášení: přihlaste se (jen poprvé).
2. Na konci musí být „Vše připraveno“ a všechny řádky **OK** (WARN nevadí).
3. Na ploše je zástupce **Portfolio Admin**.

## 2. Spuštění
1. Dvojklik na **Portfolio Admin**: otevře se černé okno a po chvíli
   prohlížeč s http://localhost:4173/admin/.
2. Nahoře zelená tečka „main · … · up to date“, žádný červený pruh.

## 3. Galerie (bez publikování)
1. Vpravo náhled homepage, najetí myší na kartu spustí smyčku.
2. Klik na kartu v náhledu otevře vlevo její úpravu. Změňte text role:
   náhled se změní. **Cancel** — změna zmizí.

## 4. Nahrání obrázku
1. **+ Add new card** → nahrajte libovolnou fotku jako náhled.
   Stav nahoře ukáže „Uploaded … → … WEBP“ (nebo JPG).
2. **Cancel**. Nahraný soubor zůstane na disku — ukáže se žlutý pruh
   „1 file(s) on disk are not in git“. To je správně.

## 5. Publikování (skutečná změna na webu)
1. Vyberte v galerii nějakou kartu, přidejte na konec role tečku, **Apply**.
2. **Save & publish** → **Publish**. Musí napsat „Committed … and pushed“.
3. Za 1–2 minuty je změna na martinposta.com.
4. Tečku zase odeberte a publikujte znovu (web je jako předtím).
   Nahraný testovací obrázek z bodu 4 se publikuje s tím — nevadí, nebo
   ho před tím smažte ze složky `site\images\thumbs`.

## 6. Mac ↔ Windows
1. Na **Macu** v adminu změňte a publikujte cokoli malého.
2. Na **Windows** zavřete a znovu otevřete admin: modrý pruh
   „Pulled 1 commit(s) from GitHub“ a změna z Macu je vidět.
3. Otevřete admin na **obou** strojích. Na Macu publikujte změnu. Na
   Windows (bez obnovení stránky) zkuste publikovat jinou změnu:
   musí to **odmítnout** s hláškou, že main na GitHubu se mezitím změnil,
   a nic nezapsat. **Load newer version** pak načte verzi z Macu.

## 7. Ostatní záložky
1. **Project pages**: otevřete stránku, klikněte do náhledu na blok —
   vlevo se vybere. Nic neukládejte.
2. **Header & footer**: náhled homepage, tlačítka Header/Footer skočí
   na místo. Nic neukládejte.
3. **Branch**: výběr ukazuje jen `main (live)` (jiné větve teď nejsou).
