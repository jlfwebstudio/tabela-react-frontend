// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
// import { saveAs } from 'file-saver'; // Removido: saveAs não é mais usado
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faSort, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite'); // Inicializa com 'Data Limite'
  const [sortDirection, setSortDirection] = useState('asc'); // Inicializa com 'asc' (mais antigo para mais novo)
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({}); // Estado para opções de filtro selecionadas
  const filterDropdownRef = useRef(null);

  // Variáveis de ambiente
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // Cabeçalhos da tabela na ordem desejada
  const tableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
  ], []);

  // Status permitidos para o filtro permanente
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO',
  ], []);

  // Função utilitária para normalizar strings para comparação (ignora acentos e caixa)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }, []);

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const parts = dateString.split('/');
    if (parts.length === 3) {
      // Garante que a data seja interpretada como DD/MM/YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      // Verifica se a data é válida antes de formatar
      if (!isNaN(date.getTime())) {
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
    }
    return dateString; // Retorna original se não conseguir formatar
  }, []);

  // Função para lidar com a seleção do arquivo
  const handleFileChange = useCallback((e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
      setData([]); // Limpa os dados anteriores ao selecionar um novo arquivo
      setSortColumn('Data Limite'); // Reseta a ordenação para o padrão
      setSortDirection('asc');
      setSearchTerm(''); // Reseta a pesquisa
      setOpenFilterDropdown(null); // Fecha qualquer dropdown de filtro
      setSelectedFilterOptions({}); // Reseta os filtros de coluna
    } else {
      setFile(null);
      setFileName('');
    }
  }, []);

  // Função para enviar o arquivo CSV para o backend
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para enviar.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao fazer upload do arquivo.');
      }

      const result = await response.json();

      // Adiciona verificações para garantir que 'result' é um array antes de usar .length
      if (!Array.isArray(result) || result.length === 0) {
        setError('O arquivo CSV está vazio ou não contém dados válidos após o processamento.');
        setData([]);
      } else {
        // Filtro permanente por status
        const filteredByStatus = result.filter(row =>
          allowedStatuses.some(status =>
            normalizeForComparison(row.Status || '') === normalizeForComparison(status) // Garante string para row.Status
          )
        );
        setData(filteredByStatus);
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro: ${err.message || 'Não foi possível processar o arquivo CSV.'}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, allowedStatuses, normalizeForComparison]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setOpenFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para alternar a ordenação da coluna
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Função para alternar a visibilidade do dropdown de filtro
  const toggleFilterDropdown = useCallback((header) => {
    setOpenFilterDropdown(openFilterDropdown === header ? null : header);
  }, [openFilterDropdown]);

  // Função para lidar com a seleção de opções de filtro
  const handleFilterOptionChange = useCallback((header, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[header] || [];
      if (currentOptions.includes(option)) {
        return { ...prev, [header]: currentOptions.filter(item => item !== option) };
      } else {
        return { ...prev, [header]: [...currentOptions, option] };
      }
    });
  }, []);

  // Função para aplicar o filtro de coluna (fecha o dropdown)
  const applyColumnFilter = useCallback(() => {
    setOpenFilterDropdown(null);
  }, []);

  // Função para limpar o filtro de uma coluna específica
  const clearColumnFilter = useCallback((header) => {
    setSelectedFilterOptions(prev => {
      const newState = { ...prev };
      delete newState[header];
      return newState;
    });
    setOpenFilterDropdown(null); // Fecha o dropdown após limpar
  }, []);

  // Função para verificar se uma data está atrasada
  const isOverdue = useCallback((dateString) => {
    if (!dateString) return false;
    const parts = dateString.split('/');
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const limitDate = new Date(year, month, day);
    limitDate.setHours(23, 59, 59, 999); // Considera o final do dia

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Considera o início do dia

    return limitDate < today;
  }, []);

  // Função para verificar se uma data vence hoje
  const isDueToday = useCallback((dateString) => {
    if (!dateString) return false;
    const parts = dateString.split('/');
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const limitDate = new Date(year, month, day);
    limitDate.setHours(0, 0, 0, 0); // Considera o início do dia

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Considera o início do dia

    return limitDate.getTime() === today.getTime();
  }, []);

  // Função para determinar a classe CSS da linha
  const getRowClass = useCallback((row) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];

    const isRowOverdue = isOverdue(dataLimite);
    const isRowDueToday = isDueToday(dataLimite);
    const needsAbono = isRowOverdue && (!justificativa || justificativa.trim() === '');

    if (needsAbono || isRowOverdue) {
      return 'row-overdue'; // Vermelho intenso para atrasadas (incluindo "FALTA ABONAR")
    } else if (isRowDueToday) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    } else {
      return 'row-default-blue'; // Azul claro para as demais
    }
  }, [isOverdue, isDueToday]);

  // Função para determinar o texto da célula "Justificativa do Abono"
  const getJustificativaCellText = useCallback((row) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const isRowOverdue = isOverdue(dataLimite);

    if (isRowOverdue && (!justificativa || justificativa.trim() === '')) {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, [isOverdue]);

  // Função para determinar o estilo da célula "Justificativa do Abono"
  const getJustificativaCellStyle = useCallback((row) => {
    const dataLimite = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const isRowOverdue = isOverdue(dataLimite);

    if (isRowOverdue && (!justificativa || justificativa.trim() === '')) {
      return { backgroundColor: '#800080', color: '#FFFFFF', fontWeight: 'bold' }; // Roxo intenso com texto branco
    }
    return {};
  }, [isOverdue]);

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtro de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header] || '').includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica filtros de coluna
    Object.keys(selectedFilterOptions).forEach(header => {
      const selectedOptions = selectedFilterOptions[header];
      if (selectedOptions && selectedOptions.length > 0) {
        filteredData = filteredData.filter(row =>
          selectedOptions.includes(String(row[header] || '')) // Garante string para comparação
        );
      }
    });

    // Aplica ordenação
    if (sortColumn) {
      filteredData = [...filteredData].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Tratamento especial para 'Data Limite'
        if (sortColumn === 'Data Limite') {
          const dateA = aValue ? new Date(aValue.split('/')[2], aValue.split('/')[1] - 1, aValue.split('/')[0]) : null;
          const dateB = bValue ? new Date(bValue.split('/')[2], bValue.split('/')[1] - 1, bValue.split('/')[0]) : null;

          if (dateA === null && dateB === null) return 0;
          if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
          if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Tratamento para outros tipos (garante que sejam strings para comparação)
        const valA = normalizeForComparison(aValue);
        const valB = normalizeForComparison(bValue);

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, normalizeForComparison]);

  // Contador de OSs atrasadas
  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => isOverdue(row['Data Limite'])).length;
  }, [filteredAndSortedData, isOverdue]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingTodayData = filteredAndSortedData.filter(row => {
      const dataLimite = row['Data Limite'];
      return isOverdue(dataLimite) || isDueToday(dataLimite);
    });

    if (pendingTodayData.length === 0) {
      alert('Não há dados pendentes para exportar hoje.');
      return;
    }

    // Mapeia os dados para o formato da planilha, aplicando formatação e cores
    const wsData = [
      tableHeaders.map(header => ({ v: header, t: 's', s: {
        fill: { fgColor: { rgb: "FF336699" } }, // Azul escuro para cabeçalhos
        font: { bold: true, color: { rgb: "FFFFFFFF" } }, // Texto branco e negrito
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { auto: 1 } },
          bottom: { style: "thin", color: { auto: 1 } },
          left: { style: "thin", color: { auto: 1 } },
          right: { style: "thin", color: { auto: 1 } }
        }
      }})), // Cabeçalhos com estilo
      ...pendingTodayData.map(row => tableHeaders.map(header => {
        let cellValue = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
        let cellStyle = {};

        const isRowOverdue = isOverdue(row['Data Limite']);
        const isRowDueToday = isDueToday(row['Data Limite']);
        const needsAbono = isRowOverdue && (!row['Justificativa do Abono'] || String(row['Justificativa do Abono']).trim() === '');

        // Estilo da célula base (cor da linha)
        if (needsAbono || isRowOverdue) {
          cellStyle.fill = { fgColor: { rgb: "FFC00000" } }; // Vermelho intenso
          cellStyle.font = { color: { rgb: "FFFFFFFF" } }; // Texto branco
        } else if (isRowDueToday) {
          cellStyle.fill = { fgColor: { rgb: "FFFFC000" } }; // Amarelo
          cellStyle.font = { color: { rgb: "FF333333" } }; // Texto escuro
        } else {
          cellStyle.fill = { fgColor: { rgb: "FFE0F2F7" } }; // Azul claro (embora não deva aparecer em "pendentes hoje")
          cellStyle.font = { color: { rgb: "FF333333" } }; // Texto escuro
        }

        // Estilo específico para a célula "Justificativa do Abono" se "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && needsAbono) {
          cellValue = 'FALTA ABONAR';
          cellStyle.fill = { fgColor: { rgb: "FF800080" } }; // Roxo intenso
          cellStyle.font = { bold: true, color: { rgb: "FFFFFFFF" } }; // Texto branco e negrito
        }

        // Formatação de data para a coluna 'Data Limite'
        if (header === 'Data Limite') {
          cellValue = formatDataLimite(row[header]);
          cellStyle.numFmt = 'DD/MM/YYYY'; // Garante formato de data no Excel
        }

        // Formatação de texto para CNPJ / CPF
        if (header === 'CNPJ / CPF') {
          cellStyle.numFmt = '@'; // Garante que o Excel trate como texto
        }

        // Adiciona bordas a todas as células
        cellStyle.border = {
          top: { style: "thin", color: { auto: 1 } },
          bottom: { style: "thin", color: { auto: 1 } },
          left: { style: "thin", color: { auto: 1 } },
          right: { style: "thin", color: { auto: 1 } }
        };

        return { v: cellValue, t: 's', s: cellStyle }; // t: 's' para string, para garantir que o Excel não tente formatar números/datas de forma indesejada
      }))
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      switch (header) {
        case 'Chamado': width = 15; break;
        case 'Numero Referencia': width = 20; break;
        case 'Contratante': width = 25; break;
        case 'Serviço': width = 35; break;
        case 'Status': width = 20; break;
        case 'Data Limite': width = 18; break;
        case 'Cliente': width = 25; break;
        case 'CNPJ / CPF': width = 25; break;
        case 'Cidade': width = 20; break;
        case 'Técnico': width = 25; break;
        case 'Prestador': width = 25; break;
        case 'Justificativa do Abono': width = 40; break;
        default: width = 20; break;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'Pendentes_Hoje.xlsx');
  }, [filteredAndSortedData, tableHeaders, isOverdue, isDueToday, formatDataLimite]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestão de Ordens de Serviço</h1>
      </header>

      <div className="action-buttons-container">
        <div className="file-upload-section">
          <label htmlFor="csv-upload" className="custom-file-upload">
            {fileName ? `Arquivo: ${fileName}` : 'Selecionar Arquivo CSV'}
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button onClick={handleUpload} disabled={!file || loading} className="process-csv-button">
            {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
          </button>
        </div>

        <div className="global-actions-section">
          <div className="search-container">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Pesquisar na tabela..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
            Exportar Pendentes Hoje
          </button>
          <div className="overdue-count">
            OSs Atrasadas: {overdueCount}
          </div>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="th-content">
                      <div className="th-text" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header && (
                          <FontAwesomeIcon
                            icon={sortDirection === 'asc' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                        {sortColumn !== header && <FontAwesomeIcon icon={faSort} className="sort-icon" />}
                      </div>
                      <div className="filter-container">
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${openFilterDropdown === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {openFilterDropdown === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
                            <div className="filter-options-container">
                              {Array.from(new Set(data.map(row => String(row[header] || '')))) // Garante string para map
                                .filter(option => option !== undefined && option !== null && option !== '') // Filtra valores vazios
                                .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)))
                                .map(option => (
                                  <label key={option} className="filter-option">
                                    <input
                                      type="checkbox"
                                      checked={selectedFilterOptions[header]?.includes(option) || false}
                                      onChange={() => handleFilterOptionChange(header, option)}
                                    />
                                    {option}
                                  </label>
                                ))}
                            </div>
                            <div className="filter-actions">
                              <button onClick={applyColumnFilter}>Aplicar</button>
                              <button onClick={() => clearColumnFilter(header)}>Limpar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  {tableHeaders.map(header => (
                    <td
                      key={header}
                      className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}
                      style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                    >
                      {header === 'Justificativa do Abono'
                        ? getJustificativaCellText(row)
                        : header === 'Data Limite'
                          ? formatDataLimite(row[header])
                          : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
