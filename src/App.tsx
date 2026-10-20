import React, { useEffect, useMemo, useState } from 'react';

type Chapter = {
  id: string;
  title: string;
  content: string[];
};

type Book = {
  id: string;
  title: string;
  author: string;
  cover: string;
  chapters: Chapter[];
};

const sampleBooks: Book[] = [
  {
    id: 'alice',
    title: 'Alice in Wonderland',
    author: 'Lewis Carroll',
    cover: '🐇',
    chapters: [
      {
        id: 'c1',
        title: 'Down the Rabbit-Hole',
        content: [
          'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversation?”',
          'So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.',
          'There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!” But when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it, and burning with curiosity, she ran across the field after it.'
        ],
      },
      {
        id: 'c2',
        title: 'The Pool of Tears',
        content: [
          '“Curiouser and curiouser!” cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English); “now I’m opening out like the largest telescope that ever was! Good-bye, feet!”',
          'She went on growing, and very soon had to kneel down on the floor: in another minute there was not even room for this, and she tried the effect of lying down with one elbow against the side of the house, and one foot up the chimney.',
          'After a time she walked on in the same manner, and this was the first time she went down the lane after sparrows and saw the mouse.'
        ],
      },
      {
        id: 'c3',
        title: 'A Caucus-Race and a Long Tale',
        content: [
          'They all crowded round her, eager to hear what she had to say, and she was soon talking very fast, as if she were making up a story to amuse them.',
          'The Mouse gave a little squeak, and went on: “I know what you are thinking about,” said the Mouse, as if it had the right to know everything; “and it’s not fair to ask me to tell you all this without telling me why you speak to me in such a way.”',
          'Alice looked at the Mouse, who was still speaking, and thought it very strange that all these creatures were so anxious to hear her speak.'
        ],
      }
    ]
  },
  {
    id: 'pride',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    cover: '📖',
    chapters: [
      {
        id: 'p1',
        title: 'It is a truth universally acknowledged',
        content: [
          'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
          'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.'
        ],
      },
      {
        id: 'p2',
        title: 'The first impression',
        content: [
          '“Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”',
          'Mr. Bennet replied that he had not.',
          '“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”'
        ],
      }
    ]
  },
  {
    id: 'forest',
    title: 'The Little Prince',
    author: 'Antoine de Saint-Exupéry',
    cover: '🌙',
    chapters: [
      {
        id: 'l1',
        title: 'The Little Prince',
        content: [
          'When I was six years old I saw a magnificent picture in a book about the jungle, called True Stories from Nature. It showed a boa constrictor swallowing a wild animal.',
          'In the book it was called “pictures of beasts.” I have always been deeply interested in the life of the wild.',
          'And so when I was ten I had the same experience as the famous explorer and I came to understand just enough to know that I was still far from being a true explorer.'
        ],
      },
      {
        id: 'l2',
        title: 'The Planet',
        content: [
          'I have lived a lot with grown-ups. I have seen them close up.',
          'Which has generally been depressing, and I don’t know why.',
          'But at least it has put me in a way of thinking that seems clear to me.'
        ],
      }
    ]
  }
];

function App() {
  const [books, setBooks] = useState<Book[]>(sampleBooks);
  const [selectedBookId, setSelectedBookId] = useState<string>(sampleBooks[0].id);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [darkMode, setDarkMode] = useState(false);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? books[0],
    [books, selectedBookId]
  );

  const totalChapters = selectedBook.chapters.length;
  const currentChapter = selectedBook.chapters[chapterIndex] ?? selectedBook.chapters[0];
  const progress = ((chapterIndex + 1) / totalChapters) * 100;

  useEffect(() => {
    const saved = localStorage.getItem('bookviewer-theme');
    if (saved) {
      setDarkMode(saved === 'dark');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('bookviewer-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const handleNextChapter = () => {
    setChapterIndex((prev) => Math.min(prev + 1, totalChapters - 1));
  };

  const handlePrevChapter = () => {
    setChapterIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleLoadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .slice(0, 5);

    const newBook: Book = {
      id: `${file.name}-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ''),
      author: 'Imported',
      cover: '📄',
      chapters: [
        {
          id: 'imported-chapter',
          title: 'Imported Text',
          content: paragraphs.length > 0 ? paragraphs : ['Your imported file is empty.'],
        },
      ],
    };

    setBooks((prev) => [newBook, ...prev]);
    setSelectedBookId(newBook.id);
    setChapterIndex(0);
    event.target.value = '';
  };

  return (
    <div className={darkMode ? 'app dark' : 'app'}>
      <aside className="sidebar">
        <div className="brand-row">
          <h1>BookViewerPro</h1>
        </div>

        <div className="library-header">
          <span>My Library</span>
          <label className="upload-button">
            Add File
            <input type="file" accept=".txt,.md" onChange={handleLoadFile} />
          </label>
        </div>

        <ul className="book-list">
          {books.map((book) => (
            <li
              key={book.id}
              className={book.id === selectedBook.id ? 'book-item active' : 'book-item'}
              onClick={() => {
                setSelectedBookId(book.id);
                setChapterIndex(0);
              }}
            >
              <span className="cover">{book.cover}</span>
              <div>
                <strong>{book.title}</strong>
                <small>{book.author}</small>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <main className="reader-panel">
        <header className="reader-toolbar">
          <div>
            <h2>{selectedBook.title}</h2>
            <p>{selectedBook.author}</p>
          </div>

          <div className="controls">
            <button onClick={handlePrevChapter} disabled={chapterIndex === 0}>Previous</button>
            <button onClick={handleNextChapter} disabled={chapterIndex === totalChapters - 1}>Next</button>
            <button onClick={() => setDarkMode((prev) => !prev)}>
              {darkMode ? 'Light' : 'Dark'}
            </button>
            <input
              type="range"
              min="14"
              max="26"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </div>
        </header>

        <div className="progress-wrap">
          <div className="progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <span>{Math.round(progress)}%</span>
        </div>

        <article className="book-article" style={{ fontSize: `${fontSize}px` }}>
          <h3>{currentChapter.title}</h3>
          {currentChapter.content.map((paragraph, index) => (
            <p key={`${currentChapter.id}-${index}`}>{paragraph}</p>
          ))}
        </article>
      </main>
    </div>
  );
}

export default App;
